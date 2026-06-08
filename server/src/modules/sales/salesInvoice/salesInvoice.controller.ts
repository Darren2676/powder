import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import path from 'path';
import fs from 'fs';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

const uploadDir = path.join(__dirname, '../../uploads/salesInvoice');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// 发票编号生成: SI-YYYYMMDD-NNN
const generateInvoiceNumber = async (factoryCode: string = ''): Promise<string> => {
  const today = new Date();
  const fc = factoryCode ? factoryCode.toUpperCase() : '';
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `SI${fc}-${dateStr}-`;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 invoice_number FROM sales_invoice WHERE invoice_number LIKE :prefix ORDER BY invoice_number DESC`,
    { replacements: { prefix: `${prefix}%` } }
  );
  let seq = 1;
  if (rows.length > 0) {
    const last = rows[0].invoice_number;
    seq = parseInt(last.substring(prefix.length), 10) + 1;
  }
  return `${prefix}${seq.toString().padStart(3, '0')}`;
};

// ==================== 开票状态联动 ====================
// 根据发货明细行ID重算开票状态
async function recalcShippingDetailInvoiceStatus(detailIds: number[], t?: any) {
  if (!detailIds || detailIds.length === 0) return;
  for (const detailId of detailIds) {
    // 计算该发货明细行的已开票数量（仅统计已审批发票）
    const [result]: any = await sequelize.query(`
      SELECT sod.quantity as ship_qty, ISNULL(inv.invoiced_qty, 0) as invoiced_qty
      FROM shipping_order_detail sod
      LEFT JOIN (
        SELECT sil.shipping_detail_id, SUM(sil.invoice_quantity) as invoiced_qty
        FROM sales_invoice_line sil
        INNER JOIN sales_invoice si ON si.invoice_number = sil.invoice_number
        WHERE si.approval_status = N'已审批'
        GROUP BY sil.shipping_detail_id
      ) inv ON inv.shipping_detail_id = sod.id
      WHERE sod.id = :detailId
    `, { replacements: { detailId }, transaction: t });

    if (result.length === 0) continue;
    const { ship_qty, invoiced_qty } = result[0];
    let status = '未开票';
    if (invoiced_qty >= ship_qty) status = '已开票';
    else if (invoiced_qty > 0) status = '部分开票';

    await sequelize.query(
      `UPDATE shipping_order_detail SET invoice_status = :status WHERE id = :detailId`,
      { replacements: { status, detailId }, transaction: t }
    );
  }
}

// 根据销售订单明细行ID重算开票状态
async function recalcSalesDetailInvoiceStatus(salesDetailIds: number[], t?: any) {
  if (!salesDetailIds || salesDetailIds.length === 0) return;
  const uniqueIds = [...new Set(salesDetailIds.filter(id => id > 0))];
  for (const detailId of uniqueIds) {
    const [result]: any = await sequelize.query(`
      SELECT sod.order_quantity as order_qty, ISNULL(inv.invoiced_qty, 0) as invoiced_qty
      FROM sales_order_detail sod
      LEFT JOIN (
        SELECT sil.sales_detail_id, SUM(sil.invoice_quantity) as invoiced_qty
        FROM sales_invoice_line sil
        INNER JOIN sales_invoice si ON si.invoice_number = sil.invoice_number
        WHERE si.approval_status = N'已审批'
        GROUP BY sil.sales_detail_id
      ) inv ON inv.sales_detail_id = sod.id
      WHERE sod.id = :detailId
    `, { replacements: { detailId }, transaction: t });

    if (result.length === 0) continue;
    const { order_qty, invoiced_qty } = result[0];
    let status = '未开票';
    if (invoiced_qty >= order_qty) status = '已开票';
    else if (invoiced_qty > 0) status = '部分开票';

    await sequelize.query(
      `UPDATE sales_order_detail SET invoice_status = :status WHERE id = :detailId`,
      { replacements: { status, detailId }, transaction: t }
    );
  }
}

// 获取发票关联的所有发货明细行ID和销售明细行ID
async function getInvoiceRelatedDetailIds(invoiceNumber: string): Promise<{ shippingDetailIds: number[], salesDetailIds: number[] }> {
  const [lines]: any = await sequelize.query(
    `SELECT shipping_detail_id, sales_detail_id FROM sales_invoice_line WHERE invoice_number = :invoiceNumber`,
    { replacements: { invoiceNumber } }
  );
  return {
    shippingDetailIds: lines.map((l: any) => l.shipping_detail_id).filter((id: number) => id > 0),
    salesDetailIds: lines.map((l: any) => l.sales_detail_id).filter((id: number) => id > 0)
  };
}

// 重算发票关联的所有明细行开票状态
async function recalcInvoiceRelatedStatus(invoiceNumber: string, t?: any) {
  const { shippingDetailIds, salesDetailIds } = await getInvoiceRelatedDetailIds(invoiceNumber);
  await recalcShippingDetailInvoiceStatus(shippingDetailIds, t);
  await recalcSalesDetailInvoiceStatus(salesDetailIds, t);
}

// ==================== 列表查询 ====================
export const getSalesInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const customer_number = (req.query.customer_number as string) || '';
    const start_date = (req.query.start_date as string) || '';
    const end_date = (req.query.end_date as string) || '';

    let whereClause = 'WHERE 1=1';
    if (search) whereClause += ` AND (si.invoice_number LIKE :search OR si.invoice_code LIKE :search OR si.invoice_no LIKE :search OR si.customer_name LIKE :search)`;
    if (approval_status) whereClause += ` AND si.approval_status = :approval_status`;
    if (customer_number) whereClause += ` AND si.customer_number = :customer_number`;
    if (start_date) whereClause += ` AND si.invoice_date >= :start_date`;
    if (end_date) whereClause += ` AND si.invoice_date < DATEADD(day, 1, CAST(:end_date AS DATE))`;

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) whereClause += ` AND si.factory_id = :_factoryId`;

    const countSql = `SELECT COUNT(*) as total FROM sales_invoice si ${whereClause}`;
    const dataSql = `SELECT * FROM (
      SELECT si.*, f.factory_name, f.factory_short,
             ROW_NUMBER() OVER (ORDER BY si.created_at DESC) AS _row_num
      FROM sales_invoice si
      LEFT JOIN factory f ON si.factory_id = f.id
      ${whereClause}
    ) t WHERE _row_num BETWEEN :offset AND :offset + :limit - 1`;

    const replacements: any = { offset: (page - 1) * limit + 1, limit, search: `%${search}%`, approval_status, customer_number, start_date, end_date };
    if (_factoryId !== null) replacements._factoryId = _factoryId;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const [rows]: any = await sequelize.query(dataSql, { replacements });

    res.json(success({ items: rows, total: countResult[0].total, page, limit }));
  } catch (err) { next(err); }
};

// ==================== 详情查询 ====================
export const getSalesInvoiceDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND si.factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [headerRows]: any = await sequelize.query(
      `SELECT si.*, f.factory_name, f.factory_short FROM sales_invoice si
       LEFT JOIN factory f ON si.factory_id = f.id
       WHERE si.invoice_number = :id${factoryCond}`,
      { replacements: { id, ...factoryReps } }
    );
    if (headerRows.length === 0) { res.status(404).json({ success: false, message: '发票不存在' }); return; }

    const [lines]: any = await sequelize.query(
      `SELECT * FROM sales_invoice_line WHERE invoice_number = :id ORDER BY line_number`, { replacements: { id } }
    );

    res.json(success({ ...headerRows[0], lines }));
  } catch (err) { next(err); }
};

// ==================== 创建发票 ====================
export const createSalesInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const b = req.body;
    const invoice_number = await generateInvoiceNumber(factoryCode);
    const t = await sequelize.transaction();

    try {
      // 插入主表
      await sequelize.query(`
        INSERT INTO sales_invoice (invoice_number, invoice_code, invoice_no, invoice_type,
          customer_number, customer_name, invoice_title, tax_id, invoice_address, invoice_phone,
          bank_name, bank_account_number, invoice_date, tax_rate,
          amount_without_tax, tax_amount, amount_with_tax, currency_code,
          remark, approval_status, created_by, factory_id)
        VALUES (:invoice_number, :invoice_code, :invoice_no, :invoice_type,
          :customer_number, :customer_name, :invoice_title, :tax_id, :invoice_address, :invoice_phone,
          :bank_name, :bank_account_number, :invoice_date, :tax_rate,
          :amount_without_tax, :tax_amount, :amount_with_tax, :currency_code,
          :remark, N'草稿', :created_by, :factory_id)
      `, {
        replacements: {
          invoice_number, invoice_code: b.invoice_code || '', invoice_no: b.invoice_no || '',
          invoice_type: b.invoice_type || '', customer_number: b.customer_number || '',
          customer_name: b.customer_name || '', invoice_title: b.invoice_title || '',
          tax_id: b.tax_id || '', invoice_address: b.invoice_address || '',
          invoice_phone: b.invoice_phone || '', bank_name: b.bank_name || '',
          bank_account_number: b.bank_account_number || '', invoice_date: b.invoice_date || null,
          tax_rate: b.tax_rate || 0, amount_without_tax: b.amount_without_tax || 0,
          tax_amount: b.tax_amount || 0, amount_with_tax: b.amount_with_tax || 0,
          currency_code: b.currency_code || 'CNY', remark: b.remark || '',
          created_by: (req as any).user?.username || '',
          factory_id: _factoryId
        },
        transaction: t
      });

      // 插入明细行
      if (b.lines && b.lines.length > 0) {
        for (let i = 0; i < b.lines.length; i++) {
          const line = b.lines[i];
          await sequelize.query(`
            INSERT INTO sales_invoice_line (invoice_number, line_number,
              shipping_order_number, shipping_detail_id, sales_order_number, sales_detail_id,
              item_number, item_name, specifications, basic_unit,
              ship_quantity, invoice_quantity, unit_price, tax_inclusive_price,
              amount_without_tax, tax_rate, tax_amount, amount_with_tax, remark)
            VALUES (:invoice_number, :line_number,
              :shipping_order_number, :shipping_detail_id, :sales_order_number, :sales_detail_id,
              :item_number, :item_name, :specifications, :basic_unit,
              :ship_quantity, :invoice_quantity, :unit_price, :tax_inclusive_price,
              :amount_without_tax, :tax_rate, :tax_amount, :amount_with_tax, :remark)
          `, {
            replacements: {
              invoice_number, line_number: (i + 1) * 10,
              shipping_order_number: line.shipping_order_number || '',
              shipping_detail_id: line.shipping_detail_id || 0,
              sales_order_number: line.sales_order_number || '',
              sales_detail_id: line.sales_detail_id || 0,
              item_number: line.item_number || '', item_name: line.item_name || '',
              specifications: line.specifications || '', basic_unit: line.basic_unit || '',
              ship_quantity: line.ship_quantity || 0, invoice_quantity: line.invoice_quantity || 0,
              unit_price: line.unit_price || 0, tax_inclusive_price: line.tax_inclusive_price || 0,
              amount_without_tax: line.amount_without_tax || 0,
              tax_rate: line.tax_rate || 0, tax_amount: line.tax_amount || 0,
              amount_with_tax: line.amount_with_tax || 0, remark: line.remark || ''
            },
            transaction: t
          });
        }
      }

      await t.commit();
      // 创建草稿发票不影响开票状态（仅审批后才影响），无需重算
      res.json(success({ invoice_number }, '创建发票成功'));
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 更新发票 ====================
export const updateSalesInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: rawId } = req.params;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const b = req.body;

    // 审批状态校验
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM sales_invoice WHERE invoice_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (chk.length === 0) { res.status(404).json({ success: false, message: '发票不存在' }); return; }
    // 已审批发票允许编辑（自动撤消为草稿后编辑）
    if (chk[0].approval_status === '已审批') {
      await sequelize.query(
        `UPDATE sales_invoice SET approval_status = N'草稿', updated_at = GETDATE() WHERE invoice_number = :id${factoryCond}`,
        { replacements: { id, ...factoryReps } }
      );
      // 撤消后重算关联明细行开票状态
      await recalcInvoiceRelatedStatus(id);
    }

    const t = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE sales_invoice SET
          invoice_code = :invoice_code, invoice_no = :invoice_no, invoice_type = :invoice_type,
          customer_number = :customer_number, customer_name = :customer_name,
          invoice_title = :invoice_title, tax_id = :tax_id, invoice_address = :invoice_address,
          invoice_phone = :invoice_phone, bank_name = :bank_name, bank_account_number = :bank_account_number,
          invoice_date = :invoice_date, tax_rate = :tax_rate,
          amount_without_tax = :amount_without_tax, tax_amount = :tax_amount,
          amount_with_tax = :amount_with_tax, currency_code = :currency_code,
          remark = :remark, updated_at = GETDATE()
        WHERE invoice_number = :id${factoryCond}
      `, {
        replacements: {
          id, invoice_code: b.invoice_code || '', invoice_no: b.invoice_no || '',
          invoice_type: b.invoice_type || '', customer_number: b.customer_number || '',
          customer_name: b.customer_name || '', invoice_title: b.invoice_title || '',
          tax_id: b.tax_id || '', invoice_address: b.invoice_address || '',
          invoice_phone: b.invoice_phone || '', bank_name: b.bank_name || '',
          bank_account_number: b.bank_account_number || '', invoice_date: b.invoice_date || null,
          tax_rate: b.tax_rate || 0, amount_without_tax: b.amount_without_tax || 0,
          tax_amount: b.tax_amount || 0, amount_with_tax: b.amount_with_tax || 0,
          currency_code: b.currency_code || 'CNY', remark: b.remark || '',
          ...factoryReps
        },
        transaction: t
      });

      // 先删后插明细行
      await sequelize.query(`DELETE FROM sales_invoice_line WHERE invoice_number = :id`, { replacements: { id }, transaction: t });
      if (b.lines && b.lines.length > 0) {
        for (let i = 0; i < b.lines.length; i++) {
          const line = b.lines[i];
          await sequelize.query(`
            INSERT INTO sales_invoice_line (invoice_number, line_number,
              shipping_order_number, shipping_detail_id, sales_order_number, sales_detail_id,
              item_number, item_name, specifications, basic_unit,
              ship_quantity, invoice_quantity, unit_price, tax_inclusive_price,
              amount_without_tax, tax_rate, tax_amount, amount_with_tax, remark)
            VALUES (:invoice_number, :line_number,
              :shipping_order_number, :shipping_detail_id, :sales_order_number, :sales_detail_id,
              :item_number, :item_name, :specifications, :basic_unit,
              :ship_quantity, :invoice_quantity, :unit_price, :tax_inclusive_price,
              :amount_without_tax, :tax_rate, :tax_amount, :amount_with_tax, :remark)
          `, {
            replacements: {
              invoice_number: id, line_number: (i + 1) * 10,
              shipping_order_number: line.shipping_order_number || '',
              shipping_detail_id: line.shipping_detail_id || 0,
              sales_order_number: line.sales_order_number || '',
              sales_detail_id: line.sales_detail_id || 0,
              item_number: line.item_number || '', item_name: line.item_name || '',
              specifications: line.specifications || '', basic_unit: line.basic_unit || '',
              ship_quantity: line.ship_quantity || 0, invoice_quantity: line.invoice_quantity || 0,
              unit_price: line.unit_price || 0, tax_inclusive_price: line.tax_inclusive_price || 0,
              amount_without_tax: line.amount_without_tax || 0,
              tax_rate: line.tax_rate || 0, tax_amount: line.tax_amount || 0,
              amount_with_tax: line.amount_with_tax || 0, remark: line.remark || ''
            },
            transaction: t
          });
        }
      }

      await t.commit();
      // 更新后重算关联明细行开票状态
      await recalcInvoiceRelatedStatus(id);
      res.json(success(null, '更新发票成功'));
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 删除发票 ====================
export const deleteSalesInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: rawId } = req.params;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM sales_invoice WHERE invoice_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (chk.length === 0) { res.status(404).json({ success: false, message: '发票不存在' }); return; }
    if (chk[0].approval_status === '已审批') { res.status(400).json({ success: false, message: '已审批的发票不允许删除，请先撤消审批' }); return; }

    // 删除前获取关联明细行ID，用于重算开票状态
    const { shippingDetailIds, salesDetailIds } = await getInvoiceRelatedDetailIds(id);
    await sequelize.query(`DELETE FROM sales_invoice_line WHERE invoice_number = :id`, { replacements: { id } });
    await sequelize.query(`DELETE FROM sales_invoice WHERE invoice_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    // 重算关联明细行开票状态
    await recalcShippingDetailInvoiceStatus(shippingDetailIds);
    await recalcSalesDetailInvoiceStatus(salesDetailIds);
    res.json(success(null, '删除发票成功'));
  } catch (err) { next(err); }
};

// ==================== 审批 ====================
export const approveSalesInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: rawId } = req.params;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM sales_invoice WHERE invoice_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (chk.length === 0) { res.status(404).json({ success: false, message: '发票不存在' }); return; }
    if (chk[0].approval_status === '已审批') { res.status(400).json({ success: false, message: '发票已审批' }); return; }

    await sequelize.query(
      `UPDATE sales_invoice SET approval_status = N'已审批', updated_at = GETDATE() WHERE invoice_number = :id${factoryCond}`,
      { replacements: { id, ...factoryReps } }
    );
    // 审批后重算关联明细行开票状态
    await recalcInvoiceRelatedStatus(id);
    res.json(success(null, '审批成功'));
  } catch (err) { next(err); }
};

// ==================== 撤消审批 ====================
export const withdrawSalesInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: rawId } = req.params;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM sales_invoice WHERE invoice_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (chk.length === 0) { res.status(404).json({ success: false, message: '发票不存在' }); return; }
    if (chk[0].approval_status !== '已审批') { res.status(400).json({ success: false, message: '仅已审批发票可撤消' }); return; }

    await sequelize.query(
      `UPDATE sales_invoice SET approval_status = N'草稿', updated_at = GETDATE() WHERE invoice_number = :id${factoryCond}`,
      { replacements: { id, ...factoryReps } }
    );
    // 撤消后重算关联明细行开票状态
    await recalcInvoiceRelatedStatus(id);
    res.json(success(null, '撤消审批成功'));
  } catch (err) { next(err); }
};

// ==================== 获取可开票发货明细行 ====================
export const getAvailableShippingDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer_number = (req.query.customer_number as string) || '';
    if (!customer_number) { res.json(success([])); return; }

    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND so.factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [rows]: any = await sequelize.query(`
      SELECT sod.id, sod.shipping_order_number, sod.sales_order_number,
        sod.sales_detail_id, sod.item_number, sod.item_name,
        sod.specifications, sod.basic_unit, sod.quantity as ship_quantity,
        sod.quantity - ISNULL(inv.invoiced_qty, 0) as available_qty,
        ISNULL(sod2.unit_price, 0) as tax_inclusive_price,
        ISNULL(sod2.tax_rate, 0) as tax_rate
      FROM shipping_order_detail sod
      INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
      LEFT JOIN sales_order_detail sod2 ON sod2.id = sod.sales_detail_id
      LEFT JOIN (
        SELECT sil.shipping_detail_id, SUM(sil.invoice_quantity) as invoiced_qty
        FROM sales_invoice_line sil
        INNER JOIN sales_invoice si ON si.invoice_number = sil.invoice_number
        WHERE si.approval_status != N'已作废'
          AND si.invoice_number != ISNULL(:exclude_invoice, '')
        GROUP BY sil.shipping_detail_id
      ) inv ON inv.shipping_detail_id = sod.id
      WHERE so.customer_number = :customer_number
        AND so.status NOT IN (N'已取消', N'待发货')
        AND sod.quantity - ISNULL(inv.invoiced_qty, 0) > 0
        ${factoryCond}
      ORDER BY sod.shipping_order_number, sod.line_number
    `, { replacements: { customer_number, exclude_invoice: (req.query.exclude_invoice as string) || '', ...factoryReps } });

    res.json(success(rows));
  } catch (err) { next(err); }
};

// ==================== 根据发货明细查发票 ====================
export const getInvoicesByShippingDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND si.factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [rows]: any = await sequelize.query(`
      SELECT si.invoice_number, si.invoice_code, si.invoice_no, si.invoice_type,
        si.invoice_date, si.customer_name, si.amount_with_tax, si.approval_status,
        sil.invoice_quantity, sil.unit_price, sil.amount_without_tax, sil.tax_rate, sil.tax_amount
      FROM sales_invoice_line sil
      INNER JOIN sales_invoice si ON si.invoice_number = sil.invoice_number
      WHERE sil.shipping_detail_id = :detailId${factoryCond}
      ORDER BY si.invoice_date DESC
    `, { replacements: { detailId, ...factoryReps } });
    res.json(success(rows));
  } catch (err) { next(err); }
};

// ==================== 根据销售订单明细查发票 ====================
export const getInvoicesBySalesDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND si.factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [rows]: any = await sequelize.query(`
      SELECT si.invoice_number, si.invoice_code, si.invoice_no, si.invoice_type,
        si.invoice_date, si.customer_name, si.amount_with_tax, si.approval_status,
        sil.shipping_order_number, sil.invoice_quantity, sil.unit_price,
        sil.amount_without_tax, sil.tax_rate, sil.tax_amount
      FROM sales_invoice_line sil
      INNER JOIN sales_invoice si ON si.invoice_number = sil.invoice_number
      WHERE sil.sales_detail_id = :detailId${factoryCond}
      ORDER BY si.invoice_date DESC
    `, { replacements: { detailId, ...factoryReps } });
    res.json(success(rows));
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
export const exportSalesInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = 'WHERE 1=1';
    if (search) whereClause += ` AND (invoice_number LIKE :search OR customer_name LIKE :search OR invoice_code LIKE :search OR invoice_no LIKE :search)`;
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) whereClause += ` AND factory_id = :_factoryId`;
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [rows]: any = await sequelize.query(
      `SELECT * FROM sales_invoice ${whereClause} ORDER BY created_at DESC`,
      { replacements: { search: `%${search}%`, ...factoryReps } }
    );
    res.json(success(rows, '导出成功'));
  } catch (err) { next(err); }
};

// ==================== 导入 ====================
export const importSalesInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(success(null, '导入功能待实现'));
  } catch (err) { next(err); }
};
