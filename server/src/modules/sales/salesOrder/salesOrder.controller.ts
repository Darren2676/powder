import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { CONDITION_STATUS, ORDER_STATUS } from '@/shared/constants/statuses';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 编号生成 ====================

// 自动生成销售订单编号: SO-YYYYMMDD-001
const generateSalesOrderNumber = async (factoryCode: string = ''): Promise<string> => {
  const today = new Date();
  const fc = factoryCode ? factoryCode.toUpperCase() : '';
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `SO${fc}-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(sales_order_number) as max_num FROM sales_order WHERE sales_order_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }

  return prefix + String(seq).padStart(3, '0');
};

// ==================== Header CRUD ====================

export const getSalesOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const order_status = (req.query.order_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(sales_order_number LIKE :search OR customer_number LIKE :search OR customer_name LIKE :search OR head_of_sales LIKE :search OR customer_po_number LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }
    if (order_status) {
      conditions.push(`order_status = :order_status`);
      replacements.order_status = order_status;
    }

    // 数据范围过滤：sales 角色只能看到自己负责的订单
    const scope = (req as any).dataScope;
    if (scope?.head_of_sales_id) {
      conditions.push(`head_of_sales_id = :dataScopeUserId`);
      replacements.dataScopeUserId = scope.head_of_sales_id;
    }

    // 工厂隔离
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      conditions.push(`factory_id = :_factoryId`);
      replacements._factoryId = _factoryId;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM sales_order ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT sales_order_number, customer_number, customer_name, head_of_sales, linkman, contacts,
               order_date, delivery_date, order_status, [condition], approval_status, remark, creation_date, creation_man, customer_po_number,
               f.factory_name, f.factory_short,
               CASE WHEN EXISTS (
                 SELECT 1 FROM sales_order_detail d
                 WHERE d.sales_order_number = sales_order.sales_order_number
                   AND d.delivery_date IS NOT NULL
                   AND CONVERT(DATE, d.delivery_date) <> CONVERT(DATE, sales_order.delivery_date)
               ) THEN 1 ELSE 0 END AS has_multi_delivery,
               ROW_NUMBER() OVER (ORDER BY sales_order_number DESC) AS _row_num
        FROM sales_order
        LEFT JOIN factory f ON sales_order.factory_id = f.id
        ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取销售订单列表成功'));
  } catch (err) { next(err); }
};

export const getSalesOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT * FROM sales_order WHERE sales_order_number = :id`, { replacements: { id } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '销售订单不存在' }); return; }
    const customerNumber = headers[0].customer_number;
    const [details]: any = await sequelize.query(
      `SELECT d.*,
              COALESCE(NULLIF(d.customer_item_number, ''), cm.customer_item_number) as customer_item_number,
              COALESCE(NULLIF(d.customer_item_description, ''), cm.customer_item_description) as customer_item_description
       FROM sales_order_detail d
       LEFT JOIN customer_material_mapping cm ON cm.customer_number = :customerNumber AND cm.item_number = d.item_number AND cm.approval_status = N'已审核'
       WHERE d.sales_order_number = :id ORDER BY d.line_number`,
      { replacements: { id, customerNumber } }
    );
    res.json(success({ header: headers[0], details }, '获取销售订单详情成功'));
  } catch (err) { next(err); }
};

export const createSalesOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const b = req.body;
    if (!b.customer_number) { res.status(400).json({ success: false, message: '客户编号不能为空' }); return; }

    const sales_order_number = await generateSalesOrderNumber(factoryCode);
    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';

    // 从客户表继承 head_of_sales_id
    let head_of_sales_id: number | null = null;
    if (b.customer_number) {
      const [custRows]: any = await sequelize.query(
        `SELECT head_of_sales_id, head_of_sales FROM customer WHERE customer_number = :cn`,
        { replacements: { cn: b.customer_number } }
      );
      if (custRows.length) {
        head_of_sales_id = custRows[0].head_of_sales_id || null;
      }
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO sales_order (sales_order_number, customer_number, customer_name, head_of_sales, head_of_sales_id, linkman, contacts,
          order_date, delivery_date, order_status, [condition], approval_status, remark, creation_date, creation_man, customer_po_number, factory_id)
        VALUES (:sales_order_number, :customer_number, :customer_name, :head_of_sales, :head_of_sales_id, :linkman, :contacts,
          :order_date, :delivery_date, :order_status, :condition, N'草稿', :remark, :creation_date, :creation_man, :customer_po_number, :factory_id)
      `, {
        replacements: {
          sales_order_number,
          customer_number: b.customer_number,
          customer_name: b.customer_name || '',
          head_of_sales: b.head_of_sales || '',
          head_of_sales_id,
          linkman: b.linkman || '',
          contacts: b.contacts || '',
          order_date: b.order_date || null,
          delivery_date: b.delivery_date || null,
          order_status: b.order_status || '待执行',
          condition: b.condition || CONDITION_STATUS.ENABLED,
          remark: b.remark || '',
          creation_date,
          creation_man,
          customer_po_number: b.customer_po_number || '',
          factory_id: _factoryId
        },
        transaction
      });

      // 插入明细行
      if (b.details && Array.isArray(b.details)) {
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO sales_order_detail (sales_order_number, line_number, item_number, item_name, specifications, basic_unit,
              product_drawing_number, order_quantity, unit_price, tax_rate, total_amount, delivery_date, remark, status,
              shipping_status, production_status, return_status, customer_item_number, customer_item_description)
            VALUES (:sales_order_number, :line_number, :item_number, :item_name, :specifications, :basic_unit,
              :product_drawing_number, :order_quantity, :unit_price, :tax_rate, :total_amount, :delivery_date, :remark, :status,
              :shipping_status, :production_status, :return_status, :customer_item_number, :customer_item_description)
          `, {
            replacements: {
              sales_order_number,
              line_number: d.line_number || (i + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              product_drawing_number: d.product_drawing_number || '',
              order_quantity: d.order_quantity || 0,
              unit_price: d.unit_price || 0,
              tax_rate: d.tax_rate || 0,
              total_amount: d.total_amount || 0,
              delivery_date: d.delivery_date || null,
              remark: d.remark || '',
              status: d.status || '未开始',
              shipping_status: d.shipping_status || '未申请',
              production_status: d.production_status || '未加入计划',
              return_status: d.return_status || '未申请',
              customer_item_number: d.customer_item_number || '',
              customer_item_description: d.customer_item_description || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success({ sales_order_number }, '创建销售订单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const updateSalesOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    // 审批状态校验
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM sales_order WHERE sales_order_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    const currentStatus = chk.length ? chk[0].approval_status : '';
    if (currentStatus !== ORDER_STATUS.DRAFT && currentStatus !== '已审批') {
      res.status(403).json({ success: false, message: '当前审批状态不允许编辑' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      if (currentStatus === '已审批') {
        // 已审批状态：仅允许更新白名单字段
        await sequelize.query(`
          UPDATE sales_order SET
            head_of_sales = :head_of_sales, linkman = :linkman, contacts = :contacts,
            delivery_date = :delivery_date, remark = :remark, customer_po_number = :customer_po_number
          WHERE sales_order_number = :id
        `, {
          replacements: {
            id,
            head_of_sales: b.head_of_sales || '',
            linkman: b.linkman || '',
            contacts: b.contacts || '',
            delivery_date: b.delivery_date || null,
            remark: b.remark || '',
            customer_po_number: b.customer_po_number || ''
          },
          transaction
        });
        // 已审批状态不处理明细行的先删后插
      } else {
        // 草稿状态：全字段更新
        // 同步更新 head_of_sales_id（根据 head_of_sales 文本匹配用户）
        let head_of_sales_id: number | null = b.head_of_sales_id || null;
        if (!head_of_sales_id && b.head_of_sales) {
          const [userMatch]: any = await sequelize.query(
            `SELECT TOP 1 id FROM users WHERE real_name = :name AND status = 'active'`,
            { replacements: { name: b.head_of_sales }, transaction }
          );
          if (userMatch.length) head_of_sales_id = userMatch[0].id;
        }
        await sequelize.query(`
          UPDATE sales_order SET
            customer_number = :customer_number, customer_name = :customer_name,
            head_of_sales = :head_of_sales, head_of_sales_id = :head_of_sales_id, linkman = :linkman, contacts = :contacts,
            order_date = :order_date, delivery_date = :delivery_date,
            order_status = :order_status, [condition] = :condition, remark = :remark,
            customer_po_number = :customer_po_number
          WHERE sales_order_number = :id
        `, {
          replacements: {
            id,
            customer_number: b.customer_number || '',
            customer_name: b.customer_name || '',
            head_of_sales: b.head_of_sales || '',
            head_of_sales_id,
            linkman: b.linkman || '',
            contacts: b.contacts || '',
            order_date: b.order_date || null,
            delivery_date: b.delivery_date || null,
            order_status: b.order_status || '',
            condition: b.condition || CONDITION_STATUS.ENABLED,
            remark: b.remark || '',
            customer_po_number: b.customer_po_number || ''
          },
          transaction
        });

        // 更新明细：先删后插
        if (b.details && Array.isArray(b.details)) {
          await sequelize.query(
            `DELETE FROM sales_order_detail WHERE sales_order_number = :id`,
            { replacements: { id }, transaction }
          );
          for (let i = 0; i < b.details.length; i++) {
            const d = b.details[i];
            await sequelize.query(`
              INSERT INTO sales_order_detail (sales_order_number, line_number, item_number, item_name, specifications, basic_unit,
                product_drawing_number, order_quantity, unit_price, tax_rate, total_amount, delivery_date, remark, status,
                shipping_status, production_status, return_status, promised_delivery_date, customer_item_number, customer_item_description)
              VALUES (:sales_order_number, :line_number, :item_number, :item_name, :specifications, :basic_unit,
                :product_drawing_number, :order_quantity, :unit_price, :tax_rate, :total_amount, :delivery_date, :remark, :status,
                :shipping_status, :production_status, :return_status, :promised_delivery_date, :customer_item_number, :customer_item_description)
            `, {
              replacements: {
                sales_order_number: id,
                line_number: d.line_number || (i + 1) * 10,
                item_number: d.item_number || '',
                item_name: d.item_name || '',
                specifications: d.specifications || '',
                basic_unit: d.basic_unit || '',
                product_drawing_number: d.product_drawing_number || '',
                order_quantity: d.order_quantity || 0,
                unit_price: d.unit_price || 0,
                tax_rate: d.tax_rate || 0,
                total_amount: d.total_amount || 0,
                delivery_date: d.delivery_date || null,
                remark: d.remark || '',
                status: d.status || '未开始',
                shipping_status: d.shipping_status || '未申请',
                production_status: d.production_status || '未加入计划',
                return_status: d.return_status || '未申请',
                promised_delivery_date: d.promised_delivery_date || null,
                customer_item_number: d.customer_item_number || '',
                customer_item_description: d.customer_item_description || ''
              },
              transaction
            });
          }
        }
      }

      await transaction.commit();
      res.json(success(null, '更新销售订单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const deleteSalesOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM sales_order WHERE sales_order_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM sales_order_detail WHERE sales_order_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM sales_order WHERE sales_order_number = :id${factoryCond}`, { replacements: { id, ...factoryReps }, transaction });
      await transaction.commit();
      res.json(success(null, '删除销售订单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== Detail CRUD ====================

export const getSalesOrderDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    // 获取主表客户编号
    const [headerRows]: any = await sequelize.query(
      `SELECT customer_number FROM sales_order WHERE sales_order_number = :headerId`,
      { replacements: { headerId } }
    );
    const customerNumber = headerRows.length ? headerRows[0].customer_number : '';
    const [items]: any = await sequelize.query(
      `SELECT d.id, d.sales_order_number, d.line_number, d.item_number, d.item_name,
              d.specifications, d.basic_unit, d.product_drawing_number,
              d.order_quantity, d.unit_price, d.tax_rate, d.total_amount,
              d.delivery_date, d.promised_delivery_date, d.remark, d.status,
              d.shipping_status, d.production_status, d.return_status, d.invoice_status,
              d.shipped_quantity, d.refunded_quantity,
              COALESCE(NULLIF(d.customer_item_number, ''), cm.customer_item_number) as customer_item_number,
              COALESCE(NULLIF(d.customer_item_description, ''), cm.customer_item_description) as customer_item_description
       FROM sales_order_detail d
       LEFT JOIN customer_material_mapping cm ON cm.customer_number = :customerNumber AND cm.item_number = d.item_number AND cm.approval_status = N'已审核'
       WHERE d.sales_order_number = :headerId ORDER BY d.line_number`,
      { replacements: { headerId, customerNumber } }
    );
    res.json(success(items, '获取销售订单明细成功'));
  } catch (err) { next(err); }
};

export const addSalesOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const b = req.body;
    // 审批状态校验
    const [headerCheck]: any = await sequelize.query(
      `SELECT approval_status FROM sales_order WHERE sales_order_number = :headerId`, { replacements: { headerId } }
    );
    if (headerCheck.length && headerCheck[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '主表已提交审批或已审批，不允许新增明细' }); return;
    }
    // 自动计算 line_number
    let line_number = b.line_number;
    if (!line_number) {
      const [maxResult]: any = await sequelize.query(
        `SELECT ISNULL(MAX(line_number), 0) as max_line FROM sales_order_detail WHERE sales_order_number = :headerId`,
        { replacements: { headerId } }
      );
      line_number = (maxResult[0].max_line || 0) + 10;
    }

    const [result]: any = await sequelize.query(`
      INSERT INTO sales_order_detail (sales_order_number, line_number, item_number, item_name, specifications, basic_unit,
        product_drawing_number, order_quantity, unit_price, tax_rate, total_amount, delivery_date, remark, status,
        shipping_status, production_status, return_status, customer_item_number, customer_item_description)
      OUTPUT INSERTED.id
      VALUES (:sales_order_number, :line_number, :item_number, :item_name, :specifications, :basic_unit,
        :product_drawing_number, :order_quantity, :unit_price, :tax_rate, :total_amount, :delivery_date, :remark, :status,
        :shipping_status, :production_status, :return_status, :customer_item_number, :customer_item_description)
    `, {
      replacements: {
        sales_order_number: headerId,
        line_number,
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        specifications: b.specifications || '',
        basic_unit: b.basic_unit || '',
        product_drawing_number: b.product_drawing_number || '',
        order_quantity: b.order_quantity || 0,
        unit_price: b.unit_price || 0,
        tax_rate: b.tax_rate || 0,
        total_amount: b.total_amount || 0,
        delivery_date: b.delivery_date || null,
        remark: b.remark || '',
        status: b.status || '未开始',
        shipping_status: b.shipping_status || '未申请',
        production_status: b.production_status || '未加入计划',
        return_status: b.return_status || '未申请',
        customer_item_number: b.customer_item_number || '',
        customer_item_description: b.customer_item_description || ''
      }
    });
    const newId = result[0]?.id;
    res.json(success({ id: newId, line_number }, '新增明细行成功'));
  } catch (err) { next(err); }
};

export const updateSalesOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const b = req.body;
    // 审批状态校验
    const [detailRow]: any = await sequelize.query(
      `SELECT sales_order_number FROM sales_order_detail WHERE id = :detailId`, { replacements: { detailId } }
    );
    if (detailRow.length) {
      const [headerCheck]: any = await sequelize.query(
        `SELECT approval_status FROM sales_order WHERE sales_order_number = :orderNum`,
        { replacements: { orderNum: detailRow[0].sales_order_number } }
      );
      const detailStatus = headerCheck.length ? headerCheck[0].approval_status : '';
      if (detailStatus !== ORDER_STATUS.DRAFT && detailStatus !== '已审批') {
        res.status(403).json({ success: false, message: '当前审批状态不允许编辑明细' }); return;
      }

      if (detailStatus === '已审批') {
        // 已审批状态：仅允许更新交货日期和备注
        await sequelize.query(`
          UPDATE sales_order_detail SET
            delivery_date = :delivery_date, remark = :remark
          WHERE id = :detailId
        `, {
          replacements: {
            detailId,
            delivery_date: b.delivery_date || null,
            remark: b.remark || ''
          }
        });
        res.json(success(null, '更新明细行成功'));
        return;
      }
    }
    // 草稿状态：全字段更新
    await sequelize.query(`
      UPDATE sales_order_detail SET
        line_number = :line_number, item_number = :item_number, item_name = :item_name,
        specifications = :specifications, basic_unit = :basic_unit, product_drawing_number = :product_drawing_number,
        order_quantity = :order_quantity, unit_price = :unit_price, tax_rate = :tax_rate, total_amount = :total_amount,
        delivery_date = :delivery_date, remark = :remark, status = :status,
        shipping_status = :shipping_status, production_status = :production_status, return_status = :return_status,
        customer_item_number = :customer_item_number, customer_item_description = :customer_item_description
      WHERE id = :detailId
    `, {
      replacements: {
        detailId,
        line_number: b.line_number || 10,
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        specifications: b.specifications || '',
        basic_unit: b.basic_unit || '',
        product_drawing_number: b.product_drawing_number || '',
        order_quantity: b.order_quantity || 0,
        unit_price: b.unit_price || 0,
        tax_rate: b.tax_rate || 0,
        total_amount: b.total_amount || 0,
        delivery_date: b.delivery_date || null,
        remark: b.remark || '',
        status: b.status || '未开始',
        shipping_status: b.shipping_status || '未申请',
        production_status: b.production_status || '未加入计划',
        return_status: b.return_status || '未申请',
        customer_item_number: b.customer_item_number || '',
        customer_item_description: b.customer_item_description || ''
      }
    });
    res.json(success(null, '更新明细行成功'));
  } catch (err) { next(err); }
};

export const deleteSalesOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const [detailRow]: any = await sequelize.query(
      `SELECT sales_order_number FROM sales_order_detail WHERE id = :detailId`, { replacements: { detailId } }
    );
    if (detailRow.length) {
      const [headerCheck]: any = await sequelize.query(
        `SELECT approval_status FROM sales_order WHERE sales_order_number = :orderNum`,
        { replacements: { orderNum: detailRow[0].sales_order_number } }
      );
      if (headerCheck.length && headerCheck[0].approval_status !== ORDER_STATUS.DRAFT) {
        res.status(403).json({ success: false, message: '主表已提交审批或已审批，不允许删除明细' }); return;
      }
    }
    await sequelize.query(`DELETE FROM sales_order_detail WHERE id = :detailId`, { replacements: { detailId } });
    res.json(success(null, '删除明细行成功'));
  } catch (err) { next(err); }
};

// ==================== Export / Import ====================

const exportFields = [
  'sales_order_number', 'customer_number', 'customer_name', 'head_of_sales', 'linkman', 'contacts',
  'order_date', 'delivery_date', 'order_status', 'condition', 'remark',
  'line_number', 'item_number', 'item_name', 'specifications', 'basic_unit',
  'product_drawing_number', 'order_quantity', 'unit_price', 'total_amount', 'detail_delivery_date', 'detail_remark'
];
const exportHeaders = [
  '销售订单编号', '客户编号', '客户名称', '销售负责人', '联系人', '联系方式',
  '订单日期', '交货日期', '订单状态', '启用状态', '备注',
  '行号', '产品编号', '产品名称', '规格', '单位',
  '产品图号', '订单数量', '单价', '金额', '明细交货日期', '明细备注'
];

export const exportSalesOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND h.factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [items]: any = await sequelize.query(`
      SELECT h.sales_order_number, h.customer_number, h.customer_name, h.head_of_sales, h.linkman, h.contacts,
             h.order_date, h.delivery_date, h.order_status, h.[condition], h.remark,
             d.line_number, d.item_number, d.item_name, d.specifications, d.basic_unit,
             d.product_drawing_number, d.order_quantity, d.unit_price, d.total_amount,
             d.delivery_date as detail_delivery_date, d.remark as detail_remark
      FROM sales_order h
      LEFT JOIN sales_order_detail d ON h.sales_order_number = d.sales_order_number
      WHERE 1=1${factoryCond}
      ORDER BY h.sales_order_number DESC, d.line_number
    `, { replacements: factoryReps });
    exportToExcel(items, exportFields, exportHeaders, 'sales_orders', res);
  } catch (err) { next(err); }
};

export const importSalesOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, exportFields, exportHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }

    const creation_man = (req as any).user?.username || '';
    const _factoryId = getFactoryId(req);
    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 按 sales_order_number 分组
    const grouped: Record<string, any[]> = {};
    for (const row of rows) {
      const key = row.sales_order_number || '';
      if (!key) continue;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    }

    let headerCount = 0;
    let detailCount = 0;
    const transaction = await sequelize.transaction();
    try {
      for (const [orderNum, groupRows] of Object.entries(grouped)) {
        const first = groupRows[0];
        const [existing]: any = await sequelize.query(
          `SELECT sales_order_number FROM sales_order WHERE sales_order_number = :id`,
          { replacements: { id: orderNum }, transaction }
        );
        if (!existing.length) {
          await sequelize.query(`
            INSERT INTO sales_order (sales_order_number, customer_number, customer_name, head_of_sales, linkman, contacts,
              order_date, delivery_date, order_status, [condition], approval_status, remark, creation_date, creation_man, factory_id)
            VALUES (:sales_order_number, :customer_number, :customer_name, :head_of_sales, :linkman, :contacts,
              :order_date, :delivery_date, :order_status, :condition, N'草稿', :remark, :creation_date, :creation_man, :factory_id)
          `, {
            replacements: {
              sales_order_number: orderNum,
              customer_number: first.customer_number || '',
              customer_name: first.customer_name || '',
              head_of_sales: first.head_of_sales || '',
              linkman: first.linkman || '',
              contacts: first.contacts || '',
              order_date: first.order_date || null,
              delivery_date: first.delivery_date || null,
              order_status: first.order_status || '待执行',
              condition: first.condition || CONDITION_STATUS.ENABLED,
              remark: first.remark || '',
              creation_date,
              creation_man,
              factory_id: _factoryId
            }, transaction
          });
          headerCount++;
        }
        // 插入明细
        for (const row of groupRows) {
          if (!row.item_number && !row.line_number) continue;
          await sequelize.query(`
            INSERT INTO sales_order_detail (sales_order_number, line_number, item_number, item_name, specifications, basic_unit,
              product_drawing_number, order_quantity, unit_price, total_amount, delivery_date, remark)
            VALUES (:sales_order_number, :line_number, :item_number, :item_name, :specifications, :basic_unit,
              :product_drawing_number, :order_quantity, :unit_price, :total_amount, :delivery_date, :remark)
          `, {
            replacements: {
              sales_order_number: orderNum,
              line_number: row.line_number || 10,
              item_number: row.item_number || '',
              item_name: row.item_name || '',
              specifications: row.specifications || '',
              basic_unit: row.basic_unit || '',
              product_drawing_number: row.product_drawing_number || '',
              order_quantity: row.order_quantity || 0,
              unit_price: row.unit_price || 0,
              total_amount: row.total_amount || 0,
              delivery_date: row.detail_delivery_date || null,
              remark: row.detail_remark || ''
            }, transaction
          });
          detailCount++;
        }
      }
      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
    res.json(success({ headerCount, detailCount }, `成功导入 ${headerCount} 条销售订单，${detailCount} 条明细行`));
  } catch (err) { next(err); }
};

// ==================== Dashboard 统计 ====================

export const getSalesOrderStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ` AND factory_id = ${_factoryId}` : '';
    const factoryCondH = _factoryId !== null ? ` AND h.factory_id = ${_factoryId}` : '';
    const scope = (req as any).dataScope;
    const scopeCondition = scope?.head_of_sales_id ? ` AND head_of_sales_id = ${scope.head_of_sales_id}` : '';
    const [totalRow]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM sales_order WHERE 1=1${scopeCondition}${factoryCond}`);
    const [draftRow]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM sales_order WHERE approval_status = N'草稿'${scopeCondition}${factoryCond}`);
    const [pendingRow]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM sales_order WHERE approval_status = N'待审批'${scopeCondition}${factoryCond}`);
    const [approvedRow]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM sales_order WHERE approval_status = N'已审批'${scopeCondition}${factoryCond}`);
    const [amountRow]: any = await sequelize.query(`SELECT ISNULL(SUM(CAST(d.total_amount AS decimal(18,2))), 0) as total FROM sales_order_detail d INNER JOIN sales_order h ON h.sales_order_number = d.sales_order_number WHERE 1=1${scopeCondition.replace('head_of_sales_id', 'h.head_of_sales_id')}${factoryCondH}`);
    const [approvedAmountRow]: any = await sequelize.query(`SELECT ISNULL(SUM(CAST(d.total_amount AS decimal(18,2))), 0) as total FROM sales_order_detail d INNER JOIN sales_order h ON h.sales_order_number = d.sales_order_number WHERE h.approval_status = N'已审批'${scopeCondition.replace('head_of_sales_id', 'h.head_of_sales_id')}${factoryCondH}`);

    res.json(success({
      total: totalRow[0].cnt,
      draft: draftRow[0].cnt,
      pending: pendingRow[0].cnt,
      approved: approvedRow[0].cnt,
      totalAmount: parseFloat(amountRow[0].total) || 0,
      approvedAmount: parseFloat(approvedAmountRow[0].total) || 0
    }));
  } catch (err) { next(err); }
};

export const getSalesOrderStatusDistribution = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ` AND factory_id = ${_factoryId}` : '';
    const [rows]: any = await sequelize.query(`SELECT approval_status, COUNT(*) as cnt FROM sales_order WHERE 1=1${factoryCond} GROUP BY approval_status`);
    const result: Record<string, number> = {};
    rows.forEach((r: any) => { result[r.approval_status || '未知'] = r.cnt; });
    res.json(success(result));
  } catch (err) { next(err); }
};

export const getSalesOrderCustomerRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ` AND h.factory_id = ${_factoryId}` : '';
    const [rows]: any = await sequelize.query(`
      SELECT TOP 10 h.customer_name,
             COUNT(DISTINCT h.sales_order_number) as order_count,
             ISNULL(SUM(CAST(d.total_amount AS decimal(18,2))), 0) as total_amount
      FROM sales_order h
      LEFT JOIN sales_order_detail d ON h.sales_order_number = d.sales_order_number
      WHERE h.customer_name IS NOT NULL AND h.customer_name <> ''${factoryCond}
      GROUP BY h.customer_name
      ORDER BY total_amount DESC
    `);
    res.json(success(rows));
  } catch (err) { next(err); }
};

export const getSalesOrderMonthlyTrend = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ` AND so.factory_id = ${_factoryId}` : '';
    const [rows]: any = await sequelize.query(`
      SELECT m.month, ISNULL(t.order_count, 0) as order_count, ISNULL(t.amount, 0) as amount
      FROM (
        SELECT CONVERT(varchar(7), DATEADD(MONTH, -n, GETDATE()), 120) as month
        FROM (SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
              UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11) nums
      ) m
      LEFT JOIN (
        SELECT CONVERT(varchar(7), CAST(order_date AS date), 120) as month,
               COUNT(*) as order_count,
               ISNULL(SUM(sub.detail_amount), 0) as amount
        FROM sales_order so
        OUTER APPLY (
          SELECT ISNULL(SUM(CAST(d.total_amount AS decimal(18,2))), 0) as detail_amount
          FROM sales_order_detail d WHERE d.sales_order_number = so.sales_order_number
        ) sub
        WHERE CAST(order_date AS date) >= DATEADD(MONTH, -12, GETDATE())${factoryCond}
        GROUP BY CONVERT(varchar(7), CAST(order_date AS date), 120)
      ) t ON m.month = t.month
      ORDER BY m.month
    `);
    res.json(success(rows));
  } catch (err) { next(err); }
};

export const getSalesOrderRecentList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ` AND h.factory_id = ${_factoryId}` : '';
    const [rows]: any = await sequelize.query(`
      SELECT TOP 10 h.sales_order_number, h.customer_name, h.order_date, h.approval_status, h.order_status,
             ISNULL((SELECT SUM(CAST(total_amount AS decimal(18,2))) FROM sales_order_detail WHERE sales_order_number = h.sales_order_number), 0) as total_amount
      FROM sales_order h
      WHERE 1=1${factoryCond}
      ORDER BY h.creation_date DESC
    `);
    res.json(success(rows));
  } catch (err) { next(err); }
};

export const getSalesOrderDeliveryTrend = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ` AND h.factory_id = ${_factoryId}` : '';
    const [rows]: any = await sequelize.query(`
      SELECT w.week_label, ISNULL(t.order_count, 0) as order_count, ISNULL(t.quantity, 0) as quantity
      FROM (
        SELECT CONVERT(varchar(10), DATEADD(WEEK, n, CAST(GETDATE() AS date)), 120) as week_start,
               CONVERT(varchar(5), DATEADD(WEEK, n, CAST(GETDATE() AS date)), 110)
               + '~' + CONVERT(varchar(5), DATEADD(DAY, 6, DATEADD(WEEK, n, CAST(GETDATE() AS date))), 110) as week_label
        FROM (SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7) nums
      ) w
      LEFT JOIN (
        SELECT CONVERT(varchar(10), DATEADD(WEEK, DATEDIFF(WEEK, CAST(GETDATE() AS date), CAST(d.delivery_date AS date)),
               CAST(GETDATE() AS date)), 120) as week_start,
               COUNT(DISTINCT d.sales_order_number) as order_count,
               SUM(CAST(d.order_quantity AS decimal(18,2))) as quantity
        FROM sales_order_detail d
        INNER JOIN sales_order h ON h.sales_order_number = d.sales_order_number
        WHERE CAST(d.delivery_date AS date) >= CAST(GETDATE() AS date)
          AND CAST(d.delivery_date AS date) < DATEADD(WEEK, 8, CAST(GETDATE() AS date))${factoryCond}
        GROUP BY CONVERT(varchar(10), DATEADD(WEEK, DATEDIFF(WEEK, CAST(GETDATE() AS date), CAST(d.delivery_date AS date)),
                 CAST(GETDATE() AS date)), 120)
      ) t ON w.week_start = t.week_start
      ORDER BY w.week_start
    `);
    res.json(success(rows));
  } catch (err) { next(err); }
};

// ==================== 销售订单明细分页列表 ====================
export const getSalesOrderDetailsPage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', status = '', approval_status = '', sales_order_number = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    // 工厂隔离
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause += ` AND h.factory_id = :_factoryId`;
      replacements._factoryId = _factoryId;
    }

    if (search) {
      whereClause += ` AND (h.sales_order_number LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search OR h.customer_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (sales_order_number) {
      whereClause += ` AND h.sales_order_number = :sales_order_number`;
      replacements.sales_order_number = sales_order_number;
    }
    if (approval_status) {
      const arr = String(approval_status).split(',').filter(Boolean);
      if (arr.length === 1) {
        whereClause += ` AND h.approval_status = :approval_status`;
        replacements.approval_status = arr[0];
      } else if (arr.length > 1) {
        const placeholders = arr.map((_: string, i: number) => `:aps${i}`).join(', ');
        whereClause += ` AND h.approval_status IN (${placeholders})`;
        arr.forEach((s: string, i: number) => { replacements[`aps${i}`] = s; });
      }
    }
    if (status) {
      const statusArr = String(status).split(',').filter(Boolean);
      if (statusArr.length === 1) {
        whereClause += ` AND d.status = :status`;
        replacements.status = statusArr[0];
      } else if (statusArr.length > 1) {
        const placeholders = statusArr.map((_: string, i: number) => `:status${i}`).join(', ');
        whereClause += ` AND d.status IN (${placeholders})`;
        statusArr.forEach((s: string, i: number) => { replacements[`status${i}`] = s; });
      }
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM sales_order_detail d
       INNER JOIN sales_order h ON h.sales_order_number = d.sales_order_number
       ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT d.id, d.sales_order_number, d.line_number, d.item_number, d.item_name,
               d.specifications, d.basic_unit, d.product_drawing_number,
               d.order_quantity, d.unit_price, d.total_amount,
               d.delivery_date, d.promised_delivery_date, d.remark, d.status,
               d.shipping_status, d.production_status, d.return_status, d.invoice_status,
               d.shipped_quantity, d.refunded_quantity,
               h.customer_number, h.customer_name, h.head_of_sales, h.linkman, h.contacts,
               h.order_date, h.delivery_date AS order_delivery_date,
               h.order_status, h.approval_status, h.customer_po_number,
               h.[condition], h.creation_date, h.creation_man,
               f.factory_name, f.factory_short,
               COALESCE(NULLIF(d.customer_item_number, ''), cm.customer_item_number) as customer_item_number,
               COALESCE(NULLIF(d.customer_item_description, ''), cm.customer_item_description) as customer_item_description,
               ROW_NUMBER() OVER (ORDER BY h.sales_order_number, d.line_number) AS _row_num
        FROM sales_order_detail d
        INNER JOIN sales_order h ON h.sales_order_number = d.sales_order_number
        LEFT JOIN factory f ON h.factory_id = f.id
        LEFT JOIN customer_material_mapping cm ON cm.customer_number = h.customer_number AND cm.item_number = d.item_number AND cm.approval_status = N'已审核'
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

// ==================== 导出选中销售订单明细 ====================
export const exportSalesOrderDetailsSelected = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      res.status(400).json({ success: false, message: '请选择要导出的记录' }); return;
    }
    if (ids.length > 1000) {
      res.status(400).json({ success: false, message: '单次导出不能超过1000条' }); return;
    }
    const _factoryId = getFactoryId(req);
    const replacements: any = {};
    ids.forEach((id: any, i: number) => { replacements[`id${i}`] = id; });
    const placeholders = ids.map((_: any, i: number) => `:id${i}`).join(', ');

    const [items]: any = await sequelize.query(`
      SELECT d.sales_order_number, d.line_number, d.item_number, d.item_name,
             d.specifications, d.basic_unit, d.product_drawing_number,
             d.order_quantity, d.unit_price, d.total_amount,
             d.delivery_date, d.promised_delivery_date, d.status,
             d.shipping_status, d.production_status, d.return_status, d.remark,
             h.customer_name, h.head_of_sales, h.customer_po_number
      FROM sales_order_detail d
      INNER JOIN sales_order h ON h.sales_order_number = d.sales_order_number
      WHERE d.id IN (${placeholders})
      ${_factoryId !== null ? ' AND h.factory_id = :_factoryId' : ''}
      ORDER BY d.sales_order_number, d.line_number
    `, { replacements: _factoryId !== null ? { ...replacements, _factoryId } : replacements });

    const fields = [
      'sales_order_number', 'line_number', 'customer_name', 'item_number', 'item_name',
      'specifications', 'basic_unit', 'product_drawing_number',
      'order_quantity', 'unit_price', 'total_amount',
      'delivery_date', 'promised_delivery_date', 'status',
      'shipping_status', 'production_status', 'return_status',
      'head_of_sales', 'customer_po_number', 'remark'
    ];
    const headers = [
      '销售订单号', '行号', '客户名称', '产品编号', '产品名称',
      '规格', '单位', '产品图号',
      '订单数量', '单价', '金额',
      '交货日期', '承诺交货日期', '状态',
      '发货状态', '生产状态', '退货状态',
      '负责人', '客户采购订单号', '备注'
    ];
    exportToExcel(items, fields, headers, 'sales_order_details_selected', res);
  } catch (err) { next(err); }
};

