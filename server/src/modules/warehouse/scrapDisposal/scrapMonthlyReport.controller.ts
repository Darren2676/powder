/**
 * 报废仓月度报表控制器
 *
 * 参照成品月度出入库报表，使用 inventory_transaction 表
 * 查询报废仓库的出入库流水，按物料编号汇总。
 */
import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

// ==================== 获取已完成的报废仓盘点单 ====================
export const getCompletedScrapStockCounts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`
      SELECT sc.count_number, sc.count_period, sc.warehouse_number, sc.warehouse_name, sc.confirmed_date
      FROM stock_count sc
      INNER JOIN warehouse w ON sc.warehouse_number = w.warehouse_number
      WHERE sc.status = N'已完成' AND w.warehouse_type = N'报废仓库'
      ORDER BY sc.count_period DESC, sc.confirmed_date DESC
    `);
    res.json(success(items));
  } catch (err) { next(err); }
};

// ==================== 报废仓月度报表 ====================
export const getScrapMonthlyReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { count_number } = req.query;
    if (!count_number) {
      return res.status(400).json({ success: false, message: '请选择盘点单' });
    }

    // Step 1: 校验盘点单
    const [headers]: any = await sequelize.query(
      `SELECT count_number, count_period, warehouse_number, warehouse_name, status FROM stock_count WHERE count_number = :count_number`,
      { replacements: { count_number } }
    );
    if (!headers.length) {
      return res.status(404).json({ success: false, message: '盘点单不存在' });
    }
    const header = headers[0];
    if (header.status !== '已完成') {
      return res.status(400).json({ success: false, message: '仅已完成的盘点单可用于报表' });
    }

    // 推算报表月份
    const [year, month] = header.count_period.split('-').map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const reportMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
    const startDate = `${reportMonth}-01`;
    const afterMonth = nextMonth === 12 ? 1 : nextMonth + 1;
    const afterYear = nextMonth === 12 ? nextYear + 1 : nextYear;
    const nextMonthStart = `${afterYear}-${String(afterMonth).padStart(2, '0')}-01`;

    // Step 2: 期初数量（盘点明细按物料编号汇总）
    const [openingRows]: any = await sequelize.query(`
      SELECT item_number, MAX(item_name) as item_name, MAX(specifications) as specifications,
        MAX(basic_unit) as basic_unit,
        SUM(ISNULL(actual_quantity, system_quantity)) as opening_qty
      FROM stock_count_detail WHERE count_number = :count_number
      GROUP BY item_number
    `, { replacements: { count_number } });

    // Step 3: 本月交易汇总（inventory_transaction - 报废仓专用）
    const [txRows]: any = await sequelize.query(`
      SELECT item_number, MAX(item_name) as item_name, MAX(specifications) as specifications,
        MAX(basic_unit) as basic_unit,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type=N'报废入库' THEN quantity ELSE 0 END) as in_scrap,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type IN (N'盘盈调整',N'月末盘盈') THEN quantity ELSE 0 END) as in_surplus,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type NOT IN (N'报废入库',N'盘盈调整',N'月末盘盈') THEN quantity ELSE 0 END) as in_other,
        SUM(CASE WHEN transaction_type=N'入库' THEN quantity ELSE 0 END) as in_total,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type=N'报废处置' THEN quantity ELSE 0 END) as out_disposal,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type IN (N'盘亏调整',N'月末盘亏') THEN quantity ELSE 0 END) as out_shortage,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type NOT IN (N'报废处置',N'盘亏调整',N'月末盘亏') THEN quantity ELSE 0 END) as out_other,
        SUM(CASE WHEN transaction_type=N'出库' THEN quantity ELSE 0 END) as out_total
      FROM inventory_transaction
      WHERE warehouse_number = :warehouse_number
        AND (accounting_period = :reportMonth OR (ISNULL(accounting_period, '') = '' AND operation_date >= :startDate AND operation_date < :nextMonthStart))
        AND status = N'正常'
      GROUP BY item_number
    `, { replacements: { warehouse_number: header.warehouse_number, reportMonth, startDate, nextMonthStart } });

    // Step 4: Node.js 层合并
    const map = new Map<string, any>();
    const numFields = ['opening_qty', 'in_scrap', 'in_surplus', 'in_other', 'in_total', 'out_disposal', 'out_shortage', 'out_other', 'out_total', 'closing_qty'];

    const defaultItem = (row: any) => ({
      item_number: row.item_number,
      item_name: row.item_name || '',
      specifications: row.specifications || '',
      basic_unit: row.basic_unit || '',
      opening_qty: 0, in_scrap: 0, in_surplus: 0, in_other: 0, in_total: 0,
      out_disposal: 0, out_shortage: 0, out_other: 0, out_total: 0,
      closing_qty: 0
    });

    for (const row of openingRows) {
      const key = row.item_number;
      const item = defaultItem(row);
      item.opening_qty = Number(row.opening_qty) || 0;
      map.set(key, item);
    }

    for (const row of txRows) {
      const key = row.item_number;
      let item = map.get(key);
      if (!item) {
        item = defaultItem(row);
        map.set(key, item);
      }
      item.in_scrap = Number(row.in_scrap) || 0;
      item.in_surplus = Number(row.in_surplus) || 0;
      item.in_other = Number(row.in_other) || 0;
      item.in_total = Number(row.in_total) || 0;
      item.out_disposal = Number(row.out_disposal) || 0;
      item.out_shortage = Number(row.out_shortage) || 0;
      item.out_other = Number(row.out_other) || 0;
      item.out_total = Number(row.out_total) || 0;
    }

    // 计算期末 + 合计
    const totals: any = {};
    numFields.forEach(f => { totals[f] = 0; });

    const items: any[] = [];
    for (const item of map.values()) {
      item.closing_qty = item.opening_qty + item.in_total - item.out_total;
      items.push(item);
      numFields.forEach(f => { totals[f] += item[f]; });
    }

    items.sort((a: any, b: any) => a.item_number.localeCompare(b.item_number));

    res.json(success({
      report_month: reportMonth,
      count_number: header.count_number,
      count_period: header.count_period,
      warehouse_number: header.warehouse_number,
      warehouse_name: header.warehouse_name,
      items,
      totals
    }));
  } catch (err) { next(err); }
};
