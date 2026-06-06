/**
 * 原料仓月度报表控制器
 *
 * 参照成品月度出入库报表，使用 material_inventory_transaction 表
 * 查询原材料和半成品的出入库流水，按物料编号汇总。
 */
import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 获取已完成的物料仓库盘点单 ====================
export const getCompletedMaterialStockCounts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 多工厂数据隔离过滤
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ` AND w.factory_id = ${_factoryId}` : '';
    const [items]: any = await sequelize.query(`
      SELECT sc.count_number, sc.count_period, sc.warehouse_number, sc.warehouse_name, sc.confirmed_date
      FROM stock_count sc
      INNER JOIN warehouse w ON sc.warehouse_number = w.warehouse_number
      WHERE sc.status = N'已完成' AND w.warehouse_type NOT IN (N'成品仓库', N'报废仓库', N'待检仓')${factoryCond}
      ORDER BY sc.count_period DESC, sc.confirmed_date DESC
    `);
    res.json(success(items));
  } catch (err) { next(err); }
};

// ==================== 获取指定仓库的可用盘点单（用于月报表期初选择） ====================
export const getStockCountsByWarehouse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { warehouse_number } = req.query;
    if (!warehouse_number) {
      return res.status(400).json({ success: false, message: '请指定仓库' });
    }
    const [items]: any = await sequelize.query(`
      SELECT count_number, count_period, warehouse_name, confirmed_date
      FROM stock_count
      WHERE warehouse_number = :wn AND status = N'已完成'
      ORDER BY count_period DESC, confirmed_date DESC
    `, { replacements: { wn: String(warehouse_number) } });
    res.json(success(items));
  } catch (err) { next(err); }
};

// ==================== 原料仓月度报表 ====================
export const getMaterialMonthlyReport = async (req: Request, res: Response, next: NextFunction) => {
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
        MAX(basic_unit) as basic_unit, MAX(product_drawing_number) as product_drawing_number,
        SUM(ISNULL(actual_quantity, system_quantity)) as opening_qty
      FROM stock_count_detail WHERE count_number = :count_number
      GROUP BY item_number
    `, { replacements: { count_number } });

    // Step 3: 本月交易汇总（material_inventory_transaction）
    const [txRows]: any = await sequelize.query(`
      SELECT item_number, MAX(item_name) as item_name, MAX(specifications) as specifications,
        MAX(basic_unit) as basic_unit, MAX(item_type) as item_type,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type=N'采购入库' THEN quantity ELSE 0 END) as in_purchase,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type=N'生产入库' THEN quantity ELSE 0 END) as in_production,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type IN (N'盘盈调整',N'月末盘盈') THEN quantity ELSE 0 END) as in_surplus,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type NOT IN (N'采购入库',N'生产入库',N'盘盈调整',N'月末盘盈') THEN quantity ELSE 0 END) as in_other,
        SUM(CASE WHEN transaction_type=N'入库' THEN quantity ELSE 0 END) as in_total,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type=N'领料出库' THEN quantity ELSE 0 END) as out_issue,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type=N'倒冲出库' THEN quantity ELSE 0 END) as out_backflush,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type=N'委外备料出库' THEN quantity ELSE 0 END) as out_outsourcing,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type IN (N'盘亏调整',N'月末盘亏') THEN quantity ELSE 0 END) as out_shortage,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type NOT IN (N'领料出库',N'倒冲出库',N'委外备料出库',N'盘亏调整',N'月末盘亏') THEN quantity ELSE 0 END) as out_other,
        SUM(CASE WHEN transaction_type=N'出库' THEN quantity ELSE 0 END) as out_total
      FROM material_inventory_transaction
      WHERE warehouse_number = :warehouse_number
        AND (accounting_period = :reportMonth OR (ISNULL(accounting_period, '') = '' AND operation_date >= :startDate AND operation_date < :nextMonthStart))
      GROUP BY item_number
    `, { replacements: { warehouse_number: header.warehouse_number, reportMonth, startDate, nextMonthStart } });

    // Step 4: Node.js 层合并
    const map = new Map<string, any>();
    const numFields = ['opening_qty', 'in_purchase', 'in_production', 'in_surplus', 'in_other', 'in_total', 'out_issue', 'out_backflush', 'out_outsourcing', 'out_shortage', 'out_other', 'out_total', 'closing_qty'];

    const defaultItem = (row: any) => ({
      item_number: row.item_number,
      item_name: row.item_name || '',
      specifications: row.specifications || '',
      basic_unit: row.basic_unit || '',
      item_type: row.item_type || '原材料',
      opening_qty: 0, in_purchase: 0, in_production: 0, in_surplus: 0, in_other: 0, in_total: 0,
      out_issue: 0, out_backflush: 0, out_outsourcing: 0, out_shortage: 0, out_other: 0, out_total: 0,
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
      // 交易行中的 item_type 更准确，覆盖期初行的默认值
      if (row.item_type) item.item_type = row.item_type;
      item.in_purchase = Number(row.in_purchase) || 0;
      item.in_production = Number(row.in_production) || 0;
      item.in_surplus = Number(row.in_surplus) || 0;
      item.in_other = Number(row.in_other) || 0;
      item.in_total = Number(row.in_total) || 0;
      item.out_issue = Number(row.out_issue) || 0;
      item.out_backflush = Number(row.out_backflush) || 0;
      item.out_outsourcing = Number(row.out_outsourcing) || 0;
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

// ==================== 按会计期间生成原料仓月度报表 ====================
export const getMaterialMonthlyReportByPeriod = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { warehouse_number, accounting_period, count_number: userCountNumber } = req.query;
    if (!warehouse_number || !accounting_period) {
      return res.status(400).json({ success: false, message: '请选择仓库和会计期间' });
    }

    const ap = String(accounting_period);
    const wn = String(warehouse_number);

    // Step 1: 查询仓库名称
    const [whRows]: any = await sequelize.query(
      `SELECT warehouse_name FROM warehouse WHERE warehouse_number = :wn`,
      { replacements: { wn } }
    );
    const warehouseName = whRows.length > 0 ? whRows[0].warehouse_name : wn;

    // Step 2: 确定期初盘点单
    // 若用户手动指定了 count_number 则使用用户选择，否则默认取最近的
    let openingRows: any[] = [];
    let countNumber: string | null = null;
    let countPeriod: string | null = null;

    if (userCountNumber) {
      // 用户手动选择的盘点单
      const [scRows]: any = await sequelize.query(
        `SELECT count_number, count_period FROM stock_count WHERE count_number = :cn AND warehouse_number = :wn AND status = N'已完成'`,
        { replacements: { cn: String(userCountNumber), wn } }
      );
      if (scRows.length > 0) {
        countNumber = scRows[0].count_number;
        countPeriod = scRows[0].count_period;
      }
    } else {
      // 默认取最近的已完成盘点单（count_period < 当前会计期间）
      const [scRows]: any = await sequelize.query(`
        SELECT TOP 1 count_number, count_period
        FROM stock_count
        WHERE warehouse_number = :wn AND status = N'已完成' AND count_period < :ap
        ORDER BY count_period DESC, confirmed_date DESC
      `, { replacements: { wn, ap } });
      if (scRows.length > 0) {
        countNumber = scRows[0].count_number;
        countPeriod = scRows[0].count_period;
      }
    }

    // 获取盘点明细作为期初
    if (countNumber) {
      const [rows]: any = await sequelize.query(`
        SELECT item_number, MAX(item_name) as item_name, MAX(specifications) as specifications,
          MAX(basic_unit) as basic_unit, MAX(product_drawing_number) as product_drawing_number,
          SUM(ISNULL(actual_quantity, system_quantity)) as opening_qty
        FROM stock_count_detail WHERE count_number = :count_number
        GROUP BY item_number
      `, { replacements: { count_number: countNumber } });
      openingRows = rows;
    }

    // Step 3: 本月交易汇总
    const startDate = `${ap}-01`;
    const [apYear, apMonth] = ap.split('-').map(Number);
    const nm = apMonth === 12 ? 1 : apMonth + 1;
    const ny = apMonth === 12 ? apYear + 1 : apYear;
    const nextMonthStart = `${ny}-${String(nm).padStart(2, '0')}-01`;

    const [txRows]: any = await sequelize.query(`
      SELECT item_number, MAX(item_name) as item_name, MAX(specifications) as specifications,
        MAX(basic_unit) as basic_unit, MAX(item_type) as item_type,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type=N'采购入库' THEN quantity ELSE 0 END) as in_purchase,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type=N'生产入库' THEN quantity ELSE 0 END) as in_production,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type IN (N'盘盈调整',N'月末盘盈') THEN quantity ELSE 0 END) as in_surplus,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type NOT IN (N'采购入库',N'生产入库',N'盘盈调整',N'月末盘盈') THEN quantity ELSE 0 END) as in_other,
        SUM(CASE WHEN transaction_type=N'入库' THEN quantity ELSE 0 END) as in_total,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type=N'领料出库' THEN quantity ELSE 0 END) as out_issue,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type=N'倒冲出库' THEN quantity ELSE 0 END) as out_backflush,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type=N'委外备料出库' THEN quantity ELSE 0 END) as out_outsourcing,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type IN (N'盘亏调整',N'月末盘亏') THEN quantity ELSE 0 END) as out_shortage,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type NOT IN (N'领料出库',N'倒冲出库',N'委外备料出库',N'盘亏调整',N'月末盘亏') THEN quantity ELSE 0 END) as out_other,
        SUM(CASE WHEN transaction_type=N'出库' THEN quantity ELSE 0 END) as out_total
      FROM material_inventory_transaction
      WHERE warehouse_number = :wn
        AND (accounting_period = :ap OR (ISNULL(accounting_period, '') = '' AND operation_date >= :startDate AND operation_date < :nextMonthStart))
      GROUP BY item_number
    `, { replacements: { wn, ap, startDate, nextMonthStart } });

    // Step 4: 合并
    const map = new Map<string, any>();
    const numFields = ['opening_qty', 'in_purchase', 'in_production', 'in_surplus', 'in_other', 'in_total', 'out_issue', 'out_backflush', 'out_outsourcing', 'out_shortage', 'out_other', 'out_total', 'closing_qty'];

    const defaultItem = (row: any) => ({
      item_number: row.item_number,
      item_name: row.item_name || '',
      specifications: row.specifications || '',
      basic_unit: row.basic_unit || '',
      item_type: row.item_type || '原材料',
      opening_qty: 0, in_purchase: 0, in_production: 0, in_surplus: 0, in_other: 0, in_total: 0,
      out_issue: 0, out_backflush: 0, out_outsourcing: 0, out_shortage: 0, out_other: 0, out_total: 0,
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
      if (row.item_type) item.item_type = row.item_type;
      item.in_purchase = Number(row.in_purchase) || 0;
      item.in_production = Number(row.in_production) || 0;
      item.in_surplus = Number(row.in_surplus) || 0;
      item.in_other = Number(row.in_other) || 0;
      item.in_total = Number(row.in_total) || 0;
      item.out_issue = Number(row.out_issue) || 0;
      item.out_backflush = Number(row.out_backflush) || 0;
      item.out_outsourcing = Number(row.out_outsourcing) || 0;
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
      report_month: ap,
      warehouse_number: wn,
      warehouse_name: warehouseName,
      count_number: countNumber,
      count_period: countPeriod,
      items,
      totals
    }));
  } catch (err) { next(err); }
};