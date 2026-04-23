import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

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

    // 涉及的销售订单数（有发货记录的去重计数）
    const [orderCountRes]: any = await sequelize.query(`
      SELECT COUNT(DISTINCT sod.sales_order_number) as total
      FROM shipping_order_detail sod
      INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
      WHERE so.shipping_date >= :start_date AND so.shipping_date < DATEADD(day, 1, CAST(:end_date AS DATE))
    `, { replacements: { start_date, end_date } });

    // 发货单数
    const [shippedOrdersRes]: any = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM shipping_order
      WHERE shipping_date >= :start_date AND shipping_date < DATEADD(day, 1, CAST(:end_date AS DATE))
    `, { replacements: { start_date, end_date } });

    // 总发货数量
    const [shippedQtyRes]: any = await sequelize.query(`
      SELECT ISNULL(SUM(sod.quantity), 0) as total
      FROM shipping_order_detail sod
      INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
      WHERE so.shipping_date >= :start_date AND so.shipping_date < DATEADD(day, 1, CAST(:end_date AS DATE))
    `, { replacements: { start_date, end_date } });

    // 总退货数量（排除已驳回）
    const [returnedQtyRes]: any = await sequelize.query(`
      SELECT ISNULL(SUM(rod.return_quantity), 0) as total
      FROM return_order_detail rod
      INNER JOIN return_order ro ON ro.return_order_number = rod.return_order_number
      WHERE ro.status != N'已驳回'
        AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
    `, { replacements: { start_date, end_date } });

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

    // 发货月度汇总
    const [shippedRows]: any = await sequelize.query(`
      SELECT CONVERT(varchar(7), so.shipping_date, 120) as month,
             ISNULL(SUM(sod.quantity), 0) as shipped_qty
      FROM shipping_order_detail sod
      INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
      WHERE so.shipping_date >= :start_date AND so.shipping_date < DATEADD(day, 1, CAST(:end_date AS DATE))
      GROUP BY CONVERT(varchar(7), so.shipping_date, 120)
    `, { replacements: { start_date, end_date } });

    // 退货月度汇总
    const [returnedRows]: any = await sequelize.query(`
      SELECT CONVERT(varchar(7), ro.creation_date, 120) as month,
             ISNULL(SUM(rod.return_quantity), 0) as returned_qty
      FROM return_order_detail rod
      INNER JOIN return_order ro ON ro.return_order_number = rod.return_order_number
      WHERE ro.status != N'已驳回'
        AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
      GROUP BY CONVERT(varchar(7), ro.creation_date, 120)
    `, { replacements: { start_date, end_date } });

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
        GROUP BY so.customer_name
      ) s
      FULL OUTER JOIN (
        SELECT ro.customer_name, SUM(rod.return_quantity) as returned_qty
        FROM return_order_detail rod
        INNER JOIN return_order ro ON ro.return_order_number = rod.return_order_number
        WHERE ro.status != N'已驳回'
          AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
        GROUP BY ro.customer_name
      ) r ON s.customer_name = r.customer_name
      ORDER BY ISNULL(s.shipped_qty, 0) DESC
    `, { replacements: { start_date, end_date } });

    res.json(success(rows));
  } catch (err) { next(err); }
};

// ==================== 产品 TOP10 ====================
export const getProductRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date, end_date } = parseDateRange(req.query);

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
        GROUP BY sod.item_number
      ) s
      FULL OUTER JOIN (
        SELECT rod.item_number, MAX(rod.item_name) as item_name, SUM(rod.return_quantity) as returned_qty
        FROM return_order_detail rod
        INNER JOIN return_order ro ON ro.return_order_number = rod.return_order_number
        WHERE ro.status != N'已驳回'
          AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
        GROUP BY rod.item_number
      ) r ON s.item_number = r.item_number
      ORDER BY ISNULL(s.shipped_qty, 0) DESC
    `, { replacements: { start_date, end_date } });

    res.json(success(rows));
  } catch (err) { next(err); }
};

// ==================== 退货原因分布 ====================
export const getReturnReasonDistribution = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date, end_date } = parseDateRange(req.query);

    const [rows]: any = await sequelize.query(`
      SELECT
        CASE WHEN ro.reason IS NULL OR ro.reason = '' THEN N'未注明原因' ELSE ro.reason END as reason,
        COUNT(*) as count,
        ISNULL(SUM(rod.return_quantity), 0) as total_qty
      FROM return_order ro
      LEFT JOIN return_order_detail rod ON rod.return_order_number = ro.return_order_number
      WHERE ro.status != N'已驳回'
        AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
      GROUP BY CASE WHEN ro.reason IS NULL OR ro.reason = '' THEN N'未注明原因' ELSE ro.reason END
      ORDER BY total_qty DESC
    `, { replacements: { start_date, end_date } });

    res.json(success(rows));
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
        )
        OR EXISTS (
          SELECT 1 FROM return_order_detail rd
          INNER JOIN return_order ro ON ro.return_order_number = rd.return_order_number
          WHERE rd.sales_detail_id = sod.id AND ro.status != N'已驳回'
            AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
        )
      )
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
        ) shipped_sub
        OUTER APPLY (
          SELECT SUM(rd.return_quantity) as returned_qty
          FROM return_order_detail rd
          INNER JOIN return_order ro ON ro.return_order_number = rd.return_order_number
          WHERE rd.sales_detail_id = sod.id AND ro.status != N'已驳回'
            AND ro.creation_date >= :start_date AND ro.creation_date < DATEADD(day, 1, CAST(:end_date AS DATE))
        ) returned_sub
        WHERE (ISNULL(shipped_sub.shipped_qty, 0) > 0 OR ISNULL(returned_sub.returned_qty, 0) > 0)
        ${searchClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({ items, total, page: pageNum, limit: pageSize }));
  } catch (err) { next(err); }
};
