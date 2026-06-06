import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

// 解析日期范围参数，默认近12个月
const parseDateRange = (query: any) => {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const start_date = query.start_date || defaultStart.toISOString().slice(0, 10);
  const end_date = query.end_date || now.toISOString().slice(0, 10);
  return { start_date, end_date };
};

// ==================== KPI 统计 ====================
export const getKPI = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date, end_date } = parseDateRange(req.query);
    const _factoryId = getFactoryId(req);
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    // 涉及的销售订单数（有发货记录的去重计数）
    const [orderCountRes]: any = await sequelize.query(`
      SELECT COUNT(DISTINCT sod.sales_order_number) as total
      FROM shipping_order_detail sod
      INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
      WHERE so.shipping_date >= :start_date AND so.shipping_date < DATEADD(day, 1, CAST(:end_date AS DATE))
        ${_factoryId !== null ? 'AND so.factory_id = :_factoryId' : ''}
    `, { replacements: { start_date, end_date, ...factoryReps } });

    // 发货单数
    const [shippedOrdersRes]: any = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM shipping_order
      WHERE shipping_date >= :start_date AND shipping_date < DATEADD(day, 1, CAST(:end_date AS DATE))
        ${_factoryId !== null ? 'AND factory_id = :_factoryId' : ''}
    `, { replacements: { start_date, end_date, ...factoryReps } });

    // 总发货数量
    const [shippedQtyRes]: any = await sequelize.query(`
      SELECT ISNULL(SUM(sod.quantity), 0) as total
      FROM shipping_order_detail sod
      INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
      WHERE so.shipping_date >= :start_date AND so.shipping_date < DATEADD(day, 1, CAST(:end_date AS DATE))
        ${_factoryId !== null ? 'AND so.factory_id = :_factoryId' : ''}
    `, { replacements: { start_date, end_date, ...factoryReps } });

    // 总退货数量（排除已驳回）
    const [returnedQtyRes]: any = await sequelize.query(`
      SELECT ISNULL(SUM(rod.return_quantity), 0) as total
      FROM return_order_detail rod
      INNER JOIN return_order ro ON ro.return_order_number = rod.return_order_number
      WHERE ro.status != N'已驳回'
        ${_factoryId !== null ? 'AND ro.factory_id = :_factoryId' : ''}
        AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
    `, { replacements: { start_date, end_date, ...factoryReps } });

    const totalShippedQty = Number(shippedQtyRes[0]?.total) || 0;
    const totalReturnedQty = Number(returnedQtyRes[0]?.total) || 0;
    const returnRate = totalShippedQty > 0 ? ((totalReturnedQty / totalShippedQty) * 100).toFixed(2) : '0.00';

    res.json(success({
      totalOrders: Number(orderCountRes[0]?.total) || 0,
      totalShippedOrders: Number(shippedOrdersRes[0]?.total) || 0,
      totalShippedQty,
      totalReturnedQty,
      returnRate: parseFloat(returnRate)
    }));
  } catch (err) { next(err); }
};

// ==================== 月度趋势 ====================
export const getMonthlyTrend = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date, end_date } = parseDateRange(req.query);
    const _factoryId = getFactoryId(req);
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    // 发货月度汇总
    const [shippedRows]: any = await sequelize.query(`
      SELECT CONVERT(varchar(7), so.shipping_date, 120) as month,
             ISNULL(SUM(sod.quantity), 0) as shipped_qty
      FROM shipping_order_detail sod
      INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
      WHERE so.shipping_date >= :start_date AND so.shipping_date < DATEADD(day, 1, CAST(:end_date AS DATE))
        ${_factoryId !== null ? 'AND so.factory_id = :_factoryId' : ''}
      GROUP BY CONVERT(varchar(7), so.shipping_date, 120)
    `, { replacements: { start_date, end_date, ...factoryReps } });

    // 退货月度汇总
    const [returnedRows]: any = await sequelize.query(`
      SELECT CONVERT(varchar(7), ro.creation_date, 120) as month,
             ISNULL(SUM(rod.return_quantity), 0) as returned_qty
      FROM return_order_detail rod
      INNER JOIN return_order ro ON ro.return_order_number = rod.return_order_number
      WHERE ro.status != N'已驳回'
        ${_factoryId !== null ? 'AND ro.factory_id = :_factoryId' : ''}
        AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
      GROUP BY CONVERT(varchar(7), ro.creation_date, 120)
    `, { replacements: { start_date, end_date, ...factoryReps } });

    // 合并月份数据
    const shippedMap: Record<string, number> = {};
    const returnedMap: Record<string, number> = {};
    for (const r of shippedRows) shippedMap[r.month] = Number(r.shipped_qty) || 0;
    for (const r of returnedRows) returnedMap[r.month] = Number(r.returned_qty) || 0;

    // 生成连续月份序列
    const months: string[] = [];
    const start = new Date(start_date + '-01');
    const end = new Date(end_date);
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      months.push(current.toISOString().slice(0, 7));
      current.setMonth(current.getMonth() + 1);
    }

    const data = months.map(m => ({
      month: m,
      shipped_qty: shippedMap[m] || 0,
      returned_qty: returnedMap[m] || 0
    }));

    res.json(success(data));
  } catch (err) { next(err); }
};

// ==================== 客户 TOP10 ====================
export const getCustomerRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date, end_date } = parseDateRange(req.query);
    const _factoryId = getFactoryId(req);
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [rows]: any = await sequelize.query(`
      SELECT TOP 10
        ISNULL(s.customer_name, r.customer_name) as customer_name,
        ISNULL(s.shipped_qty, 0) as shipped_qty,
        ISNULL(r.returned_qty, 0) as returned_qty
      FROM (
        SELECT so.customer_name, SUM(sod.quantity) as shipped_qty
        FROM shipping_order_detail sod
        INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
        WHERE so.shipping_date >= :start_date AND so.shipping_date < DATEADD(day, 1, CAST(:end_date AS DATE))
          ${_factoryId !== null ? 'AND so.factory_id = :_factoryId' : ''}
        GROUP BY so.customer_name
      ) s
      FULL OUTER JOIN (
        SELECT ro.customer_name, SUM(rod.return_quantity) as returned_qty
        FROM return_order_detail rod
        INNER JOIN return_order ro ON ro.return_order_number = rod.return_order_number
        WHERE ro.status != N'已驳回'
          ${_factoryId !== null ? 'AND ro.factory_id = :_factoryId' : ''}
          AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
        GROUP BY ro.customer_name
      ) r ON s.customer_name = r.customer_name
      ORDER BY ISNULL(s.shipped_qty, 0) DESC
    `, { replacements: { start_date, end_date, ...factoryReps } });

    res.json(success(rows));
  } catch (err) { next(err); }
};

// ==================== 产品 TOP10 ====================
export const getProductRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date, end_date } = parseDateRange(req.query);
    const _factoryId = getFactoryId(req);
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [rows]: any = await sequelize.query(`
      SELECT TOP 10
        ISNULL(s.item_number, r.item_number) as item_number,
        ISNULL(s.item_name, r.item_name) as item_name,
        ISNULL(s.shipped_qty, 0) as shipped_qty,
        ISNULL(r.returned_qty, 0) as returned_qty
      FROM (
        SELECT sod.item_number, MAX(sod.item_name) as item_name, SUM(sod.quantity) as shipped_qty
        FROM shipping_order_detail sod
        INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
        WHERE so.shipping_date >= :start_date AND so.shipping_date < DATEADD(day, 1, CAST(:end_date AS DATE))
          ${_factoryId !== null ? 'AND so.factory_id = :_factoryId' : ''}
        GROUP BY sod.item_number
      ) s
      FULL OUTER JOIN (
        SELECT rod.item_number, MAX(rod.item_name) as item_name, SUM(rod.return_quantity) as returned_qty
        FROM return_order_detail rod
        INNER JOIN return_order ro ON ro.return_order_number = rod.return_order_number
        WHERE ro.status != N'已驳回'
          ${_factoryId !== null ? 'AND ro.factory_id = :_factoryId' : ''}
          AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
        GROUP BY rod.item_number
      ) r ON s.item_number = r.item_number
      ORDER BY ISNULL(s.shipped_qty, 0) DESC
    `, { replacements: { start_date, end_date, ...factoryReps } });

    res.json(success(rows));
  } catch (err) { next(err); }
};

// ==================== 退货原因分布 ====================
export const getReturnReasonDistribution = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date, end_date } = parseDateRange(req.query);
    const _factoryId = getFactoryId(req);
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [rows]: any = await sequelize.query(`
      SELECT
        CASE WHEN ro.reason IS NULL OR ro.reason = '' THEN N'未注明原因' ELSE ro.reason END as reason,
        COUNT(*) as count,
        ISNULL(SUM(rod.return_quantity), 0) as total_qty
      FROM return_order ro
      LEFT JOIN return_order_detail rod ON rod.return_order_number = ro.return_order_number
      WHERE ro.status != N'已驳回'
        ${_factoryId !== null ? 'AND ro.factory_id = :_factoryId' : ''}
        AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
      GROUP BY CASE WHEN ro.reason IS NULL OR ro.reason = '' THEN N'未注明原因' ELSE ro.reason END
      ORDER BY total_qty DESC
    `, { replacements: { start_date, end_date, ...factoryReps } });

    res.json(success(rows));
  } catch (err) { next(err); }
};

// ==================== 发货预警（未来N天） ====================
export const getShippingWarning = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', days = 3 } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;
    const parsed = Number(days);
    const dayCount = Number.isFinite(parsed) ? parsed : 3;

    let searchClause = '';
    const replacements: any = { days: dayCount, offset, offsetEnd };
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      replacements._factoryId = _factoryId;
    }

    if (search) {
      searchClause = ` AND (so.sales_order_number LIKE :search OR so.customer_name LIKE :search OR sod.item_number LIKE :search OR sod.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const isOverdue = dayCount === -1;

    const baseWhere = `
      sod.status NOT IN (N'已完成', N'已取消')
      AND sod.shipping_status NOT IN (N'全部发货', N'超额发货')
      AND sod.promised_delivery_date IS NOT NULL
      AND so.approval_status = N'已审批'
      ${_factoryId !== null ? 'AND so.factory_id = :_factoryId' : ''}
      ${isOverdue
        ? `AND CAST(sod.promised_delivery_date AS DATE) < CAST(GETDATE() AS DATE)`
        : `AND CAST(sod.promised_delivery_date AS DATE) >= CAST(GETDATE() AS DATE)
           AND CAST(sod.promised_delivery_date AS DATE) <= DATEADD(day, :days, CAST(GETDATE() AS DATE))`
      }
      ${searchClause}
    `;

    // KPI: 按模式返回不同统计维度
    let kpi: any;
    if (isOverdue) {
      const [kpiRows]: any = await sequelize.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN DATEDIFF(day, CAST(sod.promised_delivery_date AS DATE), CAST(GETDATE() AS DATE)) = 0 THEN 1 ELSE 0 END) as today_count,
          SUM(CASE WHEN DATEDIFF(day, CAST(sod.promised_delivery_date AS DATE), CAST(GETDATE() AS DATE)) = 1 THEN 1 ELSE 0 END) as overdue_1d,
          SUM(CASE WHEN DATEDIFF(day, CAST(sod.promised_delivery_date AS DATE), CAST(GETDATE() AS DATE)) BETWEEN 2 AND 3 THEN 1 ELSE 0 END) as overdue_2_3d,
          SUM(CASE WHEN DATEDIFF(day, CAST(sod.promised_delivery_date AS DATE), CAST(GETDATE() AS DATE)) > 3 THEN 1 ELSE 0 END) as overdue_3d_plus
        FROM sales_order_detail sod
        INNER JOIN sales_order so ON so.sales_order_number = sod.sales_order_number
        WHERE ${baseWhere}
      `, { replacements });
      kpi = {
        total: Number(kpiRows[0]?.total) || 0,
        todayCount: Number(kpiRows[0]?.today_count) || 0,
        tomorrowCount: Number(kpiRows[0]?.overdue_1d) || 0,
        dayAfterCount: Number(kpiRows[0]?.overdue_2_3d) || 0,
        overdue3dPlus: Number(kpiRows[0]?.overdue_3d_plus) || 0
      };
    } else {
      const [kpiRows]: any = await sequelize.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN CAST(sod.promised_delivery_date AS DATE) = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) as today_count,
          SUM(CASE WHEN CAST(sod.promised_delivery_date AS DATE) = DATEADD(day, 1, CAST(GETDATE() AS DATE)) THEN 1 ELSE 0 END) as tomorrow_count,
          SUM(CASE WHEN CAST(sod.promised_delivery_date AS DATE) = DATEADD(day, 2, CAST(GETDATE() AS DATE)) THEN 1 ELSE 0 END) as day_after_count
        FROM sales_order_detail sod
        INNER JOIN sales_order so ON so.sales_order_number = sod.sales_order_number
        WHERE ${baseWhere}
      `, { replacements });
      kpi = {
        total: Number(kpiRows[0]?.total) || 0,
        todayCount: Number(kpiRows[0]?.today_count) || 0,
        tomorrowCount: Number(kpiRows[0]?.tomorrow_count) || 0,
        dayAfterCount: Number(kpiRows[0]?.day_after_count) || 0
      };
    }

    // 分页查询
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT
          so.sales_order_number, so.customer_number, so.customer_name, so.head_of_sales, so.order_date,
          sod.id as detail_id, sod.line_number, sod.item_number, sod.item_name,
          sod.specifications, sod.basic_unit, sod.order_quantity,
          ISNULL(sod.shipped_quantity, 0) as shipped_quantity,
          sod.order_quantity - ISNULL(sod.shipped_quantity, 0) as pending_quantity,
          sod.shipping_status, sod.production_status, sod.status,
          sod.promised_delivery_date,
          DATEDIFF(day, CAST(GETDATE() AS DATE), CAST(sod.promised_delivery_date AS DATE)) as remaining_days,
          ROW_NUMBER() OVER (ORDER BY sod.promised_delivery_date ASC, so.sales_order_number, sod.line_number) AS _row_num
        FROM sales_order_detail sod
        INNER JOIN sales_order so ON so.sales_order_number = sod.sales_order_number
        WHERE ${baseWhere}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    const cleanItems = items.map((r: any) => { const { _row_num, ...rest } = r; return rest; });

    res.json(success({ items: cleanItems, total: kpi.total, page: pageNum, limit: pageSize, kpi }));
  } catch (err) { next(err); }
};

// ==================== 销售订单明细汇总 ====================
export const getOrderSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date, end_date } = parseDateRange(req.query);
    const { page = 1, limit = 20, search = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let searchClause = '';
    const replacements: any = { start_date, end_date, offset, offsetEnd };
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      replacements._factoryId = _factoryId;
    }

    if (search) {
      searchClause = ` AND (so.sales_order_number LIKE :search OR so.customer_name LIKE :search OR sod.item_number LIKE :search OR sod.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    // 计算总数
    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM sales_order so
      INNER JOIN sales_order_detail sod ON sod.sales_order_number = so.sales_order_number
      WHERE (
        EXISTS (
          SELECT 1 FROM shipping_order_detail sd
          INNER JOIN shipping_order sh ON sh.shipping_order_number = sd.shipping_order_number
          WHERE sd.sales_detail_id = sod.id
            AND sh.shipping_date >= :start_date AND sh.shipping_date < DATEADD(day, 1, CAST(:end_date AS DATE))
            ${_factoryId !== null ? 'AND sh.factory_id = :_factoryId' : ''}
        )
        OR EXISTS (
          SELECT 1 FROM return_order_detail rd
          INNER JOIN return_order ro ON ro.return_order_number = rd.return_order_number
          WHERE rd.sales_detail_id = sod.id AND ro.status != N'已驳回'
            AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
            ${_factoryId !== null ? 'AND ro.factory_id = :_factoryId' : ''}
        )
      )
      ${_factoryId !== null ? 'AND so.factory_id = :_factoryId' : ''}
      ${searchClause}
    `, { replacements });

    const total = countResult[0]?.total || 0;

    // 分页查询
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT
          so.sales_order_number, so.customer_name, so.order_date,
          sod.item_number, sod.item_name, sod.specifications, sod.basic_unit,
          sod.order_quantity,
          ISNULL(shipped_sub.shipped_qty, 0) as shipped_qty,
          ISNULL(returned_sub.returned_qty, 0) as returned_qty,
          CASE
            WHEN ISNULL(shipped_sub.shipped_qty, 0) = 0 THEN 0
            ELSE CAST(ISNULL(returned_sub.returned_qty, 0) * 100.0 / shipped_sub.shipped_qty AS DECIMAL(10,2))
          END as return_rate,
          ROW_NUMBER() OVER (ORDER BY so.order_date DESC, so.sales_order_number, sod.item_number) AS _row_num
        FROM sales_order so
        INNER JOIN sales_order_detail sod ON sod.sales_order_number = so.sales_order_number
        OUTER APPLY (
          SELECT SUM(sd.quantity) as shipped_qty
          FROM shipping_order_detail sd
          INNER JOIN shipping_order sh ON sh.shipping_order_number = sd.shipping_order_number
          WHERE sd.sales_detail_id = sod.id
            AND sh.shipping_date >= :start_date AND sh.shipping_date < DATEADD(day, 1, CAST(:end_date AS DATE))
            ${_factoryId !== null ? 'AND sh.factory_id = :_factoryId' : ''}
        ) shipped_sub
        OUTER APPLY (
          SELECT SUM(rd.return_quantity) as returned_qty
          FROM return_order_detail rd
          INNER JOIN return_order ro ON ro.return_order_number = rd.return_order_number
          WHERE rd.sales_detail_id = sod.id AND ro.status != N'已驳回'
            AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
            ${_factoryId !== null ? 'AND ro.factory_id = :_factoryId' : ''}
        ) returned_sub
        WHERE (ISNULL(shipped_sub.shipped_qty, 0) > 0 OR ISNULL(returned_sub.returned_qty, 0) > 0)
        ${_factoryId !== null ? 'AND so.factory_id = :_factoryId' : ''}
        ${searchClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({ items, total, page: pageNum, limit: pageSize }));
  } catch (err) { next(err); }
};

// ==================== 销售发货按订单汇总表 ====================
export const getShippingByOrderSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', start_date, end_date } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let searchClause = '';
    let dateClause = '';
    const replacements: any = { offset, offsetEnd };
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      replacements._factoryId = _factoryId;
    }

    if (search) {
      searchClause = ` AND (so.sales_order_number LIKE :search OR so.customer_name LIKE :search OR sod.item_number LIKE :search OR sod.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    if (start_date && end_date) {
      dateClause = ` AND so.order_date >= :start_date AND so.order_date < DATEADD(day, 1, CAST(:end_date AS DATE))`;
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    }

    // 计算总数
    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM sales_order so
      INNER JOIN sales_order_detail sod ON sod.sales_order_number = so.sales_order_number
      WHERE so.approval_status = N'已审批'
        AND sod.status NOT IN (N'已取消')
        ${_factoryId !== null ? 'AND so.factory_id = :_factoryId' : ''}
        ${dateClause}
        ${searchClause}
    `, { replacements });

    const total = Number(countResult[0]?.total) || 0;

    // 分页查询
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT
          so.sales_order_number,
          so.customer_name,
          so.order_date,
          sod.line_number,
          sod.item_number,
          sod.item_name,
          sod.specifications,
          sod.basic_unit,
          sod.order_quantity,
          ISNULL(shipped_sub.shipped_qty, 0) as shipped_qty,
          ISNULL(returned_sub.returned_qty, 0) as returned_qty,
          ISNULL(shipped_sub.shipped_qty, 0) - ISNULL(returned_sub.returned_qty, 0) as net_shipped_qty,
          CASE WHEN sod.order_quantity = 0 THEN 0 ELSE CAST(ISNULL(shipped_sub.shipped_qty, 0) * 100.0 / sod.order_quantity AS DECIMAL(10,2)) END as ship_rate,
          CASE WHEN ISNULL(shipped_sub.shipped_qty, 0) = 0 THEN 0 ELSE CAST(ISNULL(returned_sub.returned_qty, 0) * 100.0 / shipped_sub.shipped_qty AS DECIMAL(10,2)) END as return_rate,
          ROW_NUMBER() OVER (ORDER BY so.order_date DESC, so.sales_order_number, sod.line_number) AS _row_num
        FROM sales_order so
        INNER JOIN sales_order_detail sod ON sod.sales_order_number = so.sales_order_number
        OUTER APPLY (
          SELECT SUM(sd.quantity) as shipped_qty
          FROM shipping_order_detail sd
          INNER JOIN shipping_order sh ON sh.shipping_order_number = sd.shipping_order_number
          WHERE sd.sales_detail_id = sod.id
            ${_factoryId !== null ? 'AND sh.factory_id = :_factoryId' : ''}
        ) shipped_sub
        OUTER APPLY (
          SELECT SUM(rd.return_quantity) as returned_qty
          FROM return_order_detail rd
          INNER JOIN return_order ro ON ro.return_order_number = rd.return_order_number
          WHERE rd.sales_detail_id = sod.id AND ro.status != N'已驳回'
            ${_factoryId !== null ? 'AND ro.factory_id = :_factoryId' : ''}
        ) returned_sub
        WHERE so.approval_status = N'已审批'
          AND sod.status NOT IN (N'已取消')
          ${_factoryId !== null ? 'AND so.factory_id = :_factoryId' : ''}
          ${dateClause}
          ${searchClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({ items, total, page: pageNum, limit: pageSize }));
  } catch (err) { next(err); }
};

// ==================== 导出发货按订单汇总表 ====================
export const exportShippingByOrderSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search = '', start_date, end_date } = req.query;

    let searchClause = '';
    let dateClause = '';
    const replacements: any = {};
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      replacements._factoryId = _factoryId;
    }

    if (search) {
      searchClause = ` AND (so.sales_order_number LIKE :search OR so.customer_name LIKE :search OR sod.item_number LIKE :search OR sod.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    if (start_date && end_date) {
      dateClause = ` AND so.order_date >= :start_date AND so.order_date < DATEADD(day, 1, CAST(:end_date AS DATE))`;
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    }

    const [items]: any = await sequelize.query(`
      SELECT
        so.sales_order_number,
        so.customer_name,
        so.order_date,
        sod.line_number,
        sod.item_number,
        sod.item_name,
        sod.specifications,
        sod.basic_unit,
        sod.order_quantity,
        ISNULL(shipped_sub.shipped_qty, 0) as shipped_qty,
        ISNULL(returned_sub.returned_qty, 0) as returned_qty,
        ISNULL(shipped_sub.shipped_qty, 0) - ISNULL(returned_sub.returned_qty, 0) as net_shipped_qty,
        CASE WHEN sod.order_quantity = 0 THEN 0 ELSE CAST(ISNULL(shipped_sub.shipped_qty, 0) * 100.0 / sod.order_quantity AS DECIMAL(10,2)) END as ship_rate,
        CASE WHEN ISNULL(shipped_sub.shipped_qty, 0) = 0 THEN 0 ELSE CAST(ISNULL(returned_sub.returned_qty, 0) * 100.0 / shipped_sub.shipped_qty AS DECIMAL(10,2)) END as return_rate
      FROM sales_order so
      INNER JOIN sales_order_detail sod ON sod.sales_order_number = so.sales_order_number
      OUTER APPLY (
        SELECT SUM(sd.quantity) as shipped_qty
        FROM shipping_order_detail sd
        INNER JOIN shipping_order sh ON sh.shipping_order_number = sd.shipping_order_number
        WHERE sd.sales_detail_id = sod.id
        ${_factoryId !== null ? 'AND sh.factory_id = :_factoryId' : ''}
      ) shipped_sub
      OUTER APPLY (
        SELECT SUM(rd.return_quantity) as returned_qty
        FROM return_order_detail rd
        INNER JOIN return_order ro ON ro.return_order_number = rd.return_order_number
        WHERE rd.sales_detail_id = sod.id AND ro.status != N'已驳回'
        ${_factoryId !== null ? 'AND ro.factory_id = :_factoryId' : ''}
      ) returned_sub
      WHERE so.approval_status = N'已审批'
        AND sod.status NOT IN (N'已取消')
        ${_factoryId !== null ? 'AND so.factory_id = :_factoryId' : ''}
        ${dateClause}
        ${searchClause}
      ORDER BY so.order_date DESC, so.sales_order_number, sod.line_number
    `, { replacements });

    const fields = [
      'sales_order_number', 'customer_name', 'order_date', 'line_number',
      'item_number', 'item_name', 'specifications', 'basic_unit',
      'order_quantity', 'shipped_qty', 'returned_qty', 'net_shipped_qty',
      'ship_rate', 'return_rate'
    ];
    const headers = [
      '销售订单号', '客户名称', '订单日期', '行号',
      '物料编号', '物料名称', '规格', '单位',
      '订单数量', '已发数量', '已退数量', '实发数量',
      '发货率(%)', '退货率(%)'
    ];
    exportToExcel(items, fields, headers, 'shipping_by_order_summary', res);
  } catch (err) { next(err); }
};

// ==================== 订单维度生产单报表 ====================
export const getOrderProductionSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', start_date, end_date } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let searchClause = '';
    let dateClause = '';
    const replacements: any = { offset, offsetEnd };
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      replacements._factoryId = _factoryId;
    }

    if (search) {
      searchClause = ` AND (so.sales_order_number LIKE :search OR so.customer_name LIKE :search OR sod.item_number LIKE :search OR sod.item_name LIKE :search OR pp.production_number LIKE :search OR po.production_order_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    if (start_date && end_date) {
      dateClause = ` AND so.order_date >= :start_date AND so.order_date < DATEADD(day, 1, CAST(:end_date AS DATE))`;
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    }

    // 计算总数 — 展开到工单维度
    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM sales_order so
      INNER JOIN sales_order_detail sod ON sod.sales_order_number = so.sales_order_number
      INNER JOIN Production_plan pp ON pp.source_order_number = sod.sales_order_number
        AND pp.source_line_number = sod.line_number
      LEFT JOIN production_order po ON po.production_number = pp.production_number
        AND po.item_number = pp.item_number
      WHERE so.approval_status = N'已审批'
        AND sod.status NOT IN (N'已取消')
        ${_factoryId !== null ? 'AND so.factory_id = :_factoryId' : ''}
        ${dateClause}
        ${searchClause}
    `, { replacements });

    const total = Number(countResult[0]?.total) || 0;

    // 分页查询 — 展开到工单维度
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT
          so.sales_order_number,
          so.customer_name,
          so.order_date,
          sod.line_number,
          sod.item_number,
          sod.item_name,
          sod.specifications,
          sod.basic_unit,
          sod.order_quantity,
          pp.production_number,
          pp.planned_quantity AS plan_planned_quantity,
          po.production_order_number,
          po.item_number AS po_item_number,
          po.item_name AS po_item_name,
          po.planned_quantity AS po_planned_quantity,
          po.plan_status AS po_plan_status,
          ISNULL(po.inbound_quantity, 0) AS po_inbound_quantity,
          CASE WHEN po.plan_status IN (N'已派发', N'已备料', N'生产中') THEN po.planned_quantity ELSE 0 END AS po_wip_quantity,
          CASE WHEN po.production_order_number IS NOT NULL THEN pp.planned_quantity - ISNULL(inbound_sub.total_inbound, 0) ELSE pp.planned_quantity END AS uncompleted_quantity,
          ROW_NUMBER() OVER (ORDER BY so.order_date DESC, so.sales_order_number, sod.line_number, po.production_order_number) AS _row_num
        FROM sales_order so
        INNER JOIN sales_order_detail sod ON sod.sales_order_number = so.sales_order_number
        INNER JOIN Production_plan pp ON pp.source_order_number = sod.sales_order_number
          AND pp.source_line_number = sod.line_number
        LEFT JOIN production_order po ON po.production_number = pp.production_number
          AND po.item_number = pp.item_number
        OUTER APPLY (
          SELECT ISNULL(SUM(po2.inbound_quantity), 0) AS total_inbound
          FROM production_order po2
          WHERE po2.production_number = pp.production_number
            AND po2.item_number = pp.item_number
            ${_factoryId !== null ? 'AND po2.factory_id = :_factoryId' : ''}
        ) inbound_sub
        WHERE so.approval_status = N'已审批'
          AND sod.status NOT IN (N'已取消')
          ${_factoryId !== null ? 'AND so.factory_id = :_factoryId' : ''}
          ${dateClause}
          ${searchClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    const cleanItems = items.map((r: any, i: number) => {
      const { _row_num, ...rest } = r;
      return { ...rest, _row_num: (pageNum - 1) * pageSize + i + 1 };
    });

    res.json(success({ items: cleanItems, total, page: pageNum, limit: pageSize }));
  } catch (err) { next(err); }
};
