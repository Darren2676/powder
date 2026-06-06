import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 销售负责人列表（下拉用） ====================
export const getSalesPersons = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(_req);
    const factoryCond = _factoryId !== null ? 'AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [rows]: any = await sequelize.query(`
      SELECT DISTINCT head_of_sales
      FROM sales_order
      WHERE head_of_sales IS NOT NULL AND head_of_sales != ''
        ${factoryCond}
      ORDER BY head_of_sales
    `, { replacements: factoryReps });
    res.json(success(rows.map((r: any) => r.head_of_sales)));
  } catch (err) { next(err); }
};

// ==================== 列表查询（按销售负责人维度汇总） ====================
export const getSalesPersonShippingReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const head_of_sales = (req.query.head_of_sales as string) || '';
    const start_date = (req.query.start_date as string) || '';
    const end_date = (req.query.end_date as string) || '';
    const order_status = (req.query.order_status as string) || '';
    const shipping_status = (req.query.shipping_status as string) || '';

    const conditions: string[] = [`h.approval_status = N'已审批'`];
    const replacements: any = {};
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      conditions.push(`h.factory_id = :_factoryId`);
      replacements._factoryId = _factoryId;
    }

    if (head_of_sales) {
      conditions.push(`h.head_of_sales = :head_of_sales`);
      replacements.head_of_sales = head_of_sales;
    }
    if (start_date) {
      conditions.push(`h.order_date >= :start_date`);
      replacements.start_date = start_date;
    }
    if (end_date) {
      conditions.push(`h.order_date < DATEADD(day, 1, CAST(:end_date AS DATE))`);
      replacements.end_date = end_date;
    }
    if (order_status) {
      conditions.push(`h.order_status = :order_status`);
      replacements.order_status = order_status;
    }
    if (shipping_status) {
      conditions.push(`d.shipping_status = :shipping_status`);
      replacements.shipping_status = shipping_status;
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    // 总数
    const countResult: any = await sequelize.query(`
      SELECT COUNT(*) as total FROM (
        SELECT h.head_of_sales
        FROM sales_order h
        INNER JOIN sales_order_detail d ON d.sales_order_number = h.sales_order_number
        ${whereClause}
        GROUP BY h.head_of_sales
      ) AS t
    `, { replacements });

    const total = countResult[0][0].total;
    const offset = (page - 1) * limit;

    // 汇总
    const [summaryRows]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT h.head_of_sales,
               COUNT(DISTINCT h.sales_order_number) as order_count,
               SUM(d.total_amount) as total_amount,
               SUM(d.order_quantity) as order_qty,
               SUM(d.shipped_quantity) as shipped_qty,
               SUM(CASE WHEN d.shipping_status = N'全部发货' THEN 1 ELSE 0 END) as fully_shipped_count,
               SUM(CASE WHEN d.shipping_status = N'部分发货' THEN 1 ELSE 0 END) as partial_shipped_count,
               SUM(CASE WHEN d.shipping_status IN (N'未申请', N'未发货') THEN 1 ELSE 0 END) as unshipped_count,
               SUM(CASE WHEN d.shipping_status = N'超额发货' THEN 1 ELSE 0 END) as over_shipped_count,
               ROW_NUMBER() OVER (ORDER BY SUM(d.total_amount) DESC) AS _row_num
        FROM sales_order h
        INNER JOIN sales_order_detail d ON d.sales_order_number = h.sales_order_number
        ${whereClause}
        GROUP BY h.head_of_sales
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const items = summaryRows.map((r: any) => {
      const { _row_num, total_amount, order_qty, shipped_qty, fully_shipped_count, partial_shipped_count, unshipped_count, over_shipped_count, ...rest } = r;
      const orderQty = parseFloat(order_qty) || 0;
      const shippedQty = parseFloat(shipped_qty) || 0;
      return {
        ...rest,
        order_count: parseInt(r.order_count) || 0,
        total_amount: Math.round((parseFloat(total_amount) || 0) * 100) / 100,
        order_qty: Math.round(orderQty * 100) / 100,
        shipped_qty: Math.round(shippedQty * 100) / 100,
        unshipped_qty: Math.round((orderQty - shippedQty) * 100) / 100,
        ship_rate: orderQty > 0 ? Math.round(shippedQty / orderQty * 10000) / 100 : 0,
        fully_shipped_count: parseInt(fully_shipped_count) || 0,
        partial_shipped_count: parseInt(partial_shipped_count) || 0,
        unshipped_count: parseInt(unshipped_count) || 0,
        over_shipped_count: parseInt(over_shipped_count) || 0,
        detail_count: (parseInt(fully_shipped_count) || 0) + (parseInt(partial_shipped_count) || 0) + (parseInt(unshipped_count) || 0) + (parseInt(over_shipped_count) || 0),
      };
    });

    // 获取每个销售负责人的明细
    const salesPersons = items.map((r: any) => r.head_of_sales);
    const detailMap: Record<string, any[]> = {};

    if (salesPersons.length > 0) {
      const placeholders = salesPersons.map((_: any, i: number) => `:sp${i}`).join(',');
      const detailReplacements: any = {};
      salesPersons.forEach((n: string, i: number) => { detailReplacements[`sp${i}`] = n; });

      // 添加与主查询相同的筛选条件
      const detailConditions = [`h.approval_status = N'已审批'`, `h.head_of_sales IN (${placeholders})`];
      if (_factoryId !== null) {
        detailConditions.push(`h.factory_id = :_factoryId`);
        detailReplacements._factoryId = _factoryId;
      }
      if (start_date) {
        detailConditions.push(`h.order_date >= :start_date`);
        detailReplacements.start_date = start_date;
      }
      if (end_date) {
        detailConditions.push(`h.order_date < DATEADD(day, 1, CAST(:end_date AS DATE))`);
        detailReplacements.end_date = end_date;
      }
      if (order_status) {
        detailConditions.push(`h.order_status = :order_status`);
        detailReplacements.order_status = order_status;
      }
      if (shipping_status) {
        detailConditions.push(`d.shipping_status = :shipping_status`);
        detailReplacements.shipping_status = shipping_status;
      }

      const detailWhere = 'WHERE ' + detailConditions.join(' AND ');

      const [detailRows]: any = await sequelize.query(`
        SELECT h.head_of_sales,
               h.sales_order_number, h.customer_name,
               CONVERT(VARCHAR(10), h.order_date, 120) as order_date,
               h.order_status,
               d.line_number, d.item_number, d.item_name, d.specifications, d.basic_unit,
               d.order_quantity, d.shipped_quantity, d.shipping_status,
               d.unit_price, d.total_amount,
               CONVERT(VARCHAR(10), d.delivery_date, 120) as delivery_date,
               d.refunded_quantity
        FROM sales_order h
        INNER JOIN sales_order_detail d ON d.sales_order_number = h.sales_order_number
        ${detailWhere}
        ORDER BY h.head_of_sales, h.sales_order_number, d.line_number
      `, { replacements: detailReplacements });

      for (const d of detailRows) {
        if (!detailMap[d.head_of_sales]) detailMap[d.head_of_sales] = [];
        detailMap[d.head_of_sales].push({
          ...d,
          order_quantity: parseFloat(d.order_quantity) || 0,
          shipped_quantity: parseFloat(d.shipped_quantity) || 0,
          unshipped_quantity: Math.round(((parseFloat(d.order_quantity) || 0) - (parseFloat(d.shipped_quantity) || 0)) * 100) / 100,
          unit_price: parseFloat(d.unit_price) || 0,
          total_amount: parseFloat(d.total_amount) || 0,
          refunded_quantity: parseFloat(d.refunded_quantity) || 0,
        });
      }
    }

    res.json(success({
      items,
      details: detailMap,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }, '获取销售员订单发货报表成功'));
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
export const exportSalesPersonShippingReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const head_of_sales = (req.query.head_of_sales as string) || '';
    const start_date = (req.query.start_date as string) || '';
    const end_date = (req.query.end_date as string) || '';
    const order_status = (req.query.order_status as string) || '';
    const shipping_status = (req.query.shipping_status as string) || '';

    const conditions: string[] = [`h.approval_status = N'已审批'`];
    const replacements: any = {};
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      conditions.push(`h.factory_id = :_factoryId`);
      replacements._factoryId = _factoryId;
    }

    if (head_of_sales) {
      conditions.push(`h.head_of_sales = :head_of_sales`);
      replacements.head_of_sales = head_of_sales;
    }
    if (start_date) {
      conditions.push(`h.order_date >= :start_date`);
      replacements.start_date = start_date;
    }
    if (end_date) {
      conditions.push(`h.order_date < DATEADD(day, 1, CAST(:end_date AS DATE))`);
      replacements.end_date = end_date;
    }
    if (order_status) {
      conditions.push(`h.order_status = :order_status`);
      replacements.order_status = order_status;
    }
    if (shipping_status) {
      conditions.push(`d.shipping_status = :shipping_status`);
      replacements.shipping_status = shipping_status;
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const [detailRows]: any = await sequelize.query(`
      SELECT h.head_of_sales,
             h.sales_order_number, h.customer_name,
             CONVERT(VARCHAR(10), h.order_date, 120) as order_date,
             h.order_status,
             d.line_number, d.item_number, d.item_name, d.specifications, d.basic_unit,
             d.order_quantity, d.shipped_quantity, d.shipping_status,
             d.unit_price, d.total_amount,
             CONVERT(VARCHAR(10), d.delivery_date, 120) as delivery_date,
             d.refunded_quantity
      FROM sales_order h
      INNER JOIN sales_order_detail d ON d.sales_order_number = h.sales_order_number
      ${whereClause}
      ORDER BY h.head_of_sales, h.sales_order_number, d.line_number
    `, { replacements });

    const exportData = detailRows.map((d: any) => ({
      head_of_sales: d.head_of_sales,
      sales_order_number: d.sales_order_number,
      customer_name: d.customer_name,
      order_date: d.order_date,
      order_status: d.order_status,
      line_number: d.line_number,
      item_number: d.item_number,
      item_name: d.item_name,
      specifications: d.specifications,
      basic_unit: d.basic_unit,
      order_quantity: d.order_quantity,
      shipped_quantity: d.shipped_quantity,
      unshipped_quantity: Math.round(((parseFloat(d.order_quantity) || 0) - (parseFloat(d.shipped_quantity) || 0)) * 100) / 100,
      shipping_status: d.shipping_status,
      unit_price: d.unit_price,
      total_amount: d.total_amount,
      delivery_date: d.delivery_date,
      refunded_quantity: d.refunded_quantity,
    }));

    const fields = [
      'head_of_sales', 'sales_order_number', 'customer_name', 'order_date', 'order_status',
      'line_number', 'item_number', 'item_name', 'specifications', 'basic_unit',
      'order_quantity', 'shipped_quantity', 'unshipped_quantity', 'shipping_status',
      'unit_price', 'total_amount', 'delivery_date', 'refunded_quantity'
    ];
    const headers = [
      '销售负责人', '订单编号', '客户名称', '订单日期', '订单状态',
      '行号', '物料编号', '物料名称', '规格', '单位',
      '订单数量', '已发数量', '未发数量', '发货状态',
      '单价', '金额', '交货日期', '退货数量'
    ];

    exportToExcel(exportData, fields, headers, 'sales_person_shipping_report', res);
  } catch (err) { next(err); }
};
