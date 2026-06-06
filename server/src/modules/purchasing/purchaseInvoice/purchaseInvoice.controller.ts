import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// 发票编号生成: PI-YYYYMMDD-NNN
const generateInvoiceNumber = async (factoryCode: string = ''): Promise<string> => {
  const today = new Date();
  const fc = factoryCode ? factoryCode.toUpperCase() : '';
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PI${fc}-${dateStr}-`;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 invoice_number FROM purchase_invoice WHERE invoice_number LIKE :prefix ORDER BY invoice_number DESC`,
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
// 根据入库明细行ID重算开票状态
async function recalcStockInDetailInvoiceStatus(detailIds: number[], t?: any) {
  if (!detailIds || detailIds.length === 0) return;
  for (const detailId of detailIds) {
    const [result]: any = await sequelize.query(`
      SELECT sid.qualified_quantity as in_qty, ISNULL(inv.invoiced_qty, 0) as invoiced_qty
      FROM stock_in_detail sid
      LEFT JOIN (
        SELECT pil.stock_in_detail_id, SUM(pil.invoice_quantity) as invoiced_qty
        FROM purchase_invoice_line pil
        INNER JOIN purchase_invoice pi ON pi.invoice_number = pil.invoice_number
        WHERE pi.approval_status = N'已审批'
        GROUP BY pil.stock_in_detail_id
      ) inv ON inv.stock_in_detail_id = sid.id
      WHERE sid.id = :detailId
    `, { replacements: { detailId }, transaction: t });

    if (result.length === 0) continue;
    const { in_qty, invoiced_qty } = result[0];
    let status = '未开票';
    if (invoiced_qty >= in_qty) status = '已开票';
    else if (invoiced_qty > 0) status = '部分开票';

    await sequelize.query(
      `UPDATE stock_in_detail SET invoice_status = :status WHERE id = :detailId`,
      { replacements: { status, detailId }, transaction: t }
    );
  }
}

// 根据采购订单明细行ID重算开票状态
async function recalcPurchaseDetailInvoiceStatus(purchaseDetailIds: number[], t?: any) {
  if (!purchaseDetailIds || purchaseDetailIds.length === 0) return;
  const uniqueIds = [...new Set(purchaseDetailIds.filter(id => id > 0))];
  for (const detailId of uniqueIds) {
    const [result]: any = await sequelize.query(`
      SELECT pod.order_quantity as order_qty, ISNULL(inv.invoiced_qty, 0) as invoiced_qty
      FROM purchase_order_detail pod
      LEFT JOIN (
        SELECT pil.purchase_detail_id, SUM(pil.invoice_quantity) as invoiced_qty
        FROM purchase_invoice_line pil
        INNER JOIN purchase_invoice pi ON pi.invoice_number = pil.invoice_number
        WHERE pi.approval_status = N'已审批'
        GROUP BY pil.purchase_detail_id
      ) inv ON inv.purchase_detail_id = pod.id
      WHERE pod.id = :detailId
    `, { replacements: { detailId }, transaction: t });

    if (result.length === 0) continue;
    const { order_qty, invoiced_qty } = result[0];
    let status = '未开票';
    if (invoiced_qty >= order_qty) status = '已开票';
    else if (invoiced_qty > 0) status = '部分开票';

    await sequelize.query(
      `UPDATE purchase_order_detail SET invoice_status = :status WHERE id = :detailId`,
      { replacements: { status, detailId }, transaction: t }
    );
  }
}

// 获取发票关联的所有明细行ID
async function getInvoiceRelatedDetailIds(invoiceNumber: string): Promise<{ stockInDetailIds: number[], purchaseDetailIds: number[] }> {
  const [lines]: any = await sequelize.query(
    `SELECT stock_in_detail_id, purchase_detail_id FROM purchase_invoice_line WHERE invoice_number = :invoiceNumber`,
    { replacements: { invoiceNumber } }
  );
  return {
    stockInDetailIds: lines.map((l: any) => l.stock_in_detail_id).filter((id: number) => id > 0),
    purchaseDetailIds: lines.map((l: any) => l.purchase_detail_id).filter((id: number) => id > 0)
  };
}

// 重算发票关联的所有明细行开票状态
async function recalcInvoiceRelatedStatus(invoiceNumber: string, t?: any) {
  const { stockInDetailIds, purchaseDetailIds } = await getInvoiceRelatedDetailIds(invoiceNumber);
  await recalcStockInDetailInvoiceStatus(stockInDetailIds, t);
  await recalcPurchaseDetailInvoiceStatus(purchaseDetailIds, t);
}

// ==================== 列表查询 ====================
export const getPurchaseInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const supplier_number = (req.query.supplier_number as string) || '';
    const start_date = (req.query.start_date as string) || '';
    const end_date = (req.query.end_date as string) || '';

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset: (page - 1) * limit + 1, limit, search: `%${search}%`, approval_status, supplier_number, start_date, end_date };
    if (search) whereClause += ` AND (pi.invoice_number LIKE :search OR pi.invoice_code LIKE :search OR pi.invoice_no LIKE :search OR pi.supplier_name LIKE :search)`;
    if (approval_status) whereClause += ` AND pi.approval_status = :approval_status`;
    if (supplier_number) whereClause += ` AND pi.supplier_number = :supplier_number`;
    if (start_date) whereClause += ` AND pi.invoice_date >= :start_date`;
    if (end_date) whereClause += ` AND pi.invoice_date < DATEADD(day, 1, CAST(:end_date AS DATE))`;
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) { whereClause += ` AND pi.factory_id = :_factoryId`; replacements._factoryId = _factoryId; }

    const countSql = `SELECT COUNT(*) as total FROM purchase_invoice pi ${whereClause}`;
    const dataSql = `SELECT * FROM (
      SELECT pi.*, ROW_NUMBER() OVER (ORDER BY pi.created_at DESC) AS _row_num
      FROM purchase_invoice pi ${whereClause}
    ) t WHERE _row_num BETWEEN :offset AND :offset + :limit - 1`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const [rows]: any = await sequelize.query(dataSql, { replacements });

    res.json(success({ items: rows, total: countResult[0].total, page, limit }));
  } catch (err) { next(err); }
};

// ==================== 详情查询 ====================
export const getPurchaseInvoiceDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const [headerRows]: any = await sequelize.query(
      `SELECT * FROM purchase_invoice WHERE invoice_number = :id${factoryCond}`, { replacements: { id, ...(_factoryId !== null ? { _factoryId } : {}) } }
    );
    if (headerRows.length === 0) { res.status(404).json({ success: false, message: '发票不存在' }); return; }

    const [lines]: any = await sequelize.query(
      `SELECT * FROM purchase_invoice_line WHERE invoice_number = :id ORDER BY line_number`, { replacements: { id } }
    );

    res.json(success({ ...headerRows[0], lines }));
  } catch (err) { next(err); }
};

// ==================== 创建发票 ====================
export const createPurchaseInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const b = req.body;
    const invoice_number = await generateInvoiceNumber(factoryCode);
    const t = await sequelize.transaction();

    try {
      await sequelize.query(`
        INSERT INTO purchase_invoice (invoice_number, invoice_code, invoice_no, invoice_type,
          supplier_number, supplier_name, invoice_title, tax_id, invoice_address, invoice_phone,
          bank_name, bank_account_number, invoice_date, tax_rate,
          amount_without_tax, tax_amount, amount_with_tax, currency_code,
          remark, approval_status, created_by, factory_id)
        VALUES (:invoice_number, :invoice_code, :invoice_no, :invoice_type,
          :supplier_number, :supplier_name, :invoice_title, :tax_id, :invoice_address, :invoice_phone,
          :bank_name, :bank_account_number, :invoice_date, :tax_rate,
          :amount_without_tax, :tax_amount, :amount_with_tax, :currency_code,
          :remark, N'草稿', :created_by, :factory_id)
      `, {
        replacements: {
          invoice_number, invoice_code: b.invoice_code || '', invoice_no: b.invoice_no || '',
          invoice_type: b.invoice_type || '', supplier_number: b.supplier_number || '',
          supplier_name: b.supplier_name || '', invoice_title: b.invoice_title || '',
          tax_id: b.tax_id || '', invoice_address: b.invoice_address || '',
          invoice_phone: b.invoice_phone || '', bank_name: b.bank_name || '',
          bank_account_number: b.bank_account_number || '', invoice_date: b.invoice_date || null,
          tax_rate: b.tax_rate || 0, amount_without_tax: b.amount_without_tax || 0,
          tax_amount: b.tax_amount || 0, amount_with_tax: b.amount_with_tax || 0,
          currency_code: b.currency_code || 'CNY', remark: b.remark || '',
          created_by: (req as any).user?.username || '',
          factory_id: req.body.factory_id || _factoryId
        },
        transaction: t
      });

      if (b.lines && b.lines.length > 0) {
        for (let i = 0; i < b.lines.length; i++) {
          const line = b.lines[i];
          await sequelize.query(`
            INSERT INTO purchase_invoice_line (invoice_number, line_number,
              stock_in_number, stock_in_detail_id, purchase_order_number, purchase_detail_id,
              item_number, item_name, specifications, basic_unit,
              stock_in_quantity, invoice_quantity, unit_price,
              amount_without_tax, tax_rate, tax_amount, amount_with_tax, remark)
            VALUES (:invoice_number, :line_number,
              :stock_in_number, :stock_in_detail_id, :purchase_order_number, :purchase_detail_id,
              :item_number, :item_name, :specifications, :basic_unit,
              :stock_in_quantity, :invoice_quantity, :unit_price,
              :amount_without_tax, :tax_rate, :tax_amount, :amount_with_tax, :remark)
          `, {
            replacements: {
              invoice_number, line_number: (i + 1) * 10,
              stock_in_number: line.stock_in_number || '',
              stock_in_detail_id: line.stock_in_detail_id || 0,
              purchase_order_number: line.purchase_order_number || '',
              purchase_detail_id: line.purchase_detail_id || 0,
              item_number: line.item_number || '', item_name: line.item_name || '',
              specifications: line.specifications || '', basic_unit: line.basic_unit || '',
              stock_in_quantity: line.stock_in_quantity || 0, invoice_quantity: line.invoice_quantity || 0,
              unit_price: line.unit_price || 0, amount_without_tax: line.amount_without_tax || 0,
              tax_rate: line.tax_rate || 0, tax_amount: line.tax_amount || 0,
              amount_with_tax: line.amount_with_tax || 0, remark: line.remark || ''
            },
            transaction: t
          });
        }
      }

      await t.commit();
      res.json(success({ invoice_number }, '创建采购发票成功'));
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 更新发票 ====================
export const updatePurchaseInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: rawId } = req.params;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const b = req.body;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM purchase_invoice WHERE invoice_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (chk.length === 0) { res.status(404).json({ success: false, message: '发票不存在' }); return; }
    // 已审批发票允许编辑（自动撤消为草稿后编辑）
    if (chk[0].approval_status === '已审批') {
      await sequelize.query(
        `UPDATE purchase_invoice SET approval_status = N'草稿', updated_at = GETDATE() WHERE invoice_number = :id${factoryCond}`,
        { replacements: { id, ...factoryReps } }
      );
      await recalcInvoiceRelatedStatus(id);
    }

    const t = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE purchase_invoice SET
          invoice_code = :invoice_code, invoice_no = :invoice_no, invoice_type = :invoice_type,
          supplier_number = :supplier_number, supplier_name = :supplier_name,
          invoice_title = :invoice_title, tax_id = :tax_id, invoice_address = :invoice_address,
          invoice_phone = :invoice_phone, bank_name = :bank_name, bank_account_number = :bank_account_number,
          invoice_date = :invoice_date, tax_rate = :tax_rate,
          amount_without_tax = :amount_without_tax, tax_amount = :tax_amount,
          amount_with_tax = :amount_with_tax, currency_code = :currency_code,
          remark = :remark, updated_at = GETDATE()
        WHERE invoice_number = :id${factoryCond}
      `, {
        replacements: {
          id, ...factoryReps, invoice_code: b.invoice_code || '', invoice_no: b.invoice_no || '',
          invoice_type: b.invoice_type || '', supplier_number: b.supplier_number || '',
          supplier_name: b.supplier_name || '', invoice_title: b.invoice_title || '',
          tax_id: b.tax_id || '', invoice_address: b.invoice_address || '',
          invoice_phone: b.invoice_phone || '', bank_name: b.bank_name || '',
          bank_account_number: b.bank_account_number || '', invoice_date: b.invoice_date || null,
          tax_rate: b.tax_rate || 0, amount_without_tax: b.amount_without_tax || 0,
          tax_amount: b.tax_amount || 0, amount_with_tax: b.amount_with_tax || 0,
          currency_code: b.currency_code || 'CNY', remark: b.remark || ''
        },
        transaction: t
      });

      await sequelize.query(`DELETE FROM purchase_invoice_line WHERE invoice_number = :id`, { replacements: { id }, transaction: t }); // line表无factory_id，通过header关联
      if (b.lines && b.lines.length > 0) {
        for (let i = 0; i < b.lines.length; i++) {
          const line = b.lines[i];
          await sequelize.query(`
            INSERT INTO purchase_invoice_line (invoice_number, line_number,
              stock_in_number, stock_in_detail_id, purchase_order_number, purchase_detail_id,
              item_number, item_name, specifications, basic_unit,
              stock_in_quantity, invoice_quantity, unit_price,
              amount_without_tax, tax_rate, tax_amount, amount_with_tax, remark)
            VALUES (:invoice_number, :line_number,
              :stock_in_number, :stock_in_detail_id, :purchase_order_number, :purchase_detail_id,
              :item_number, :item_name, :specifications, :basic_unit,
              :stock_in_quantity, :invoice_quantity, :unit_price,
              :amount_without_tax, :tax_rate, :tax_amount, :amount_with_tax, :remark)
          `, {
            replacements: {
              invoice_number: id, line_number: (i + 1) * 10,
              stock_in_number: line.stock_in_number || '',
              stock_in_detail_id: line.stock_in_detail_id || 0,
              purchase_order_number: line.purchase_order_number || '',
              purchase_detail_id: line.purchase_detail_id || 0,
              item_number: line.item_number || '', item_name: line.item_name || '',
              specifications: line.specifications || '', basic_unit: line.basic_unit || '',
              stock_in_quantity: line.stock_in_quantity || 0, invoice_quantity: line.invoice_quantity || 0,
              unit_price: line.unit_price || 0, amount_without_tax: line.amount_without_tax || 0,
              tax_rate: line.tax_rate || 0, tax_amount: line.tax_amount || 0,
              amount_with_tax: line.amount_with_tax || 0, remark: line.remark || ''
            },
            transaction: t
          });
        }
      }

      await t.commit();
      await recalcInvoiceRelatedStatus(id);
      res.json(success(null, '更新采购发票成功'));
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 删除发票 ====================
export const deletePurchaseInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: rawId } = req.params;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM purchase_invoice WHERE invoice_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (chk.length === 0) { res.status(404).json({ success: false, message: '发票不存在' }); return; }
    if (chk[0].approval_status === '已审批') { res.status(400).json({ success: false, message: '已审批的发票不允许删除，请先撤消审批' }); return; }

    const { stockInDetailIds, purchaseDetailIds } = await getInvoiceRelatedDetailIds(id);
    await sequelize.query(`DELETE FROM purchase_invoice_line WHERE invoice_number = :id`, { replacements: { id } }); // line表无factory_id
    await sequelize.query(`DELETE FROM purchase_invoice WHERE invoice_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    await recalcStockInDetailInvoiceStatus(stockInDetailIds);
    await recalcPurchaseDetailInvoiceStatus(purchaseDetailIds);
    res.json(success(null, '删除采购发票成功'));
  } catch (err) { next(err); }
};

// ==================== 审批 ====================
export const approvePurchaseInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: rawId } = req.params;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM purchase_invoice WHERE invoice_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (chk.length === 0) { res.status(404).json({ success: false, message: '发票不存在' }); return; }
    if (chk[0].approval_status === '已审批') { res.status(400).json({ success: false, message: '发票已审批' }); return; }

    await sequelize.query(
      `UPDATE purchase_invoice SET approval_status = N'已审批', updated_at = GETDATE() WHERE invoice_number = :id${factoryCond}`,
      { replacements: { id, ...factoryReps } }
    );
    await recalcInvoiceRelatedStatus(id);
    res.json(success(null, '审批成功'));
  } catch (err) { next(err); }
};

// ==================== 撤消审批 ====================
export const withdrawPurchaseInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: rawId } = req.params;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM purchase_invoice WHERE invoice_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (chk.length === 0) { res.status(404).json({ success: false, message: '发票不存在' }); return; }
    if (chk[0].approval_status !== '已审批') { res.status(400).json({ success: false, message: '仅已审批发票可撤消' }); return; }

    await sequelize.query(
      `UPDATE purchase_invoice SET approval_status = N'草稿', updated_at = GETDATE() WHERE invoice_number = :id${factoryCond}`,
      { replacements: { id, ...factoryReps } }
    );
    await recalcInvoiceRelatedStatus(id);
    res.json(success(null, '撤消审批成功'));
  } catch (err) { next(err); }
};

// ==================== 获取可开票入库明细行 ====================
export const getAvailableStockInDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplier_number = (req.query.supplier_number as string) || '';
    if (!supplier_number) { res.json(success([])); return; }

    const [rows]: any = await sequelize.query(`
      SELECT sid.id, sid.stock_in_number, sid.purchase_order_number,
        sid.purchase_detail_id, sid.item_number, sid.item_name,
        sid.specifications, sid.basic_unit, sid.qualified_quantity as stock_in_quantity,
        sid.qualified_quantity - ISNULL(inv.invoiced_qty, 0) as available_qty
      FROM stock_in_detail sid
      INNER JOIN stock_in si ON si.stock_in_number = sid.stock_in_number
      LEFT JOIN (
        SELECT pil.stock_in_detail_id, SUM(pil.invoice_quantity) as invoiced_qty
        FROM purchase_invoice_line pil
        INNER JOIN purchase_invoice pi ON pi.invoice_number = pil.invoice_number
        WHERE pi.approval_status != N'已作废'
          AND pi.invoice_number != ISNULL(:exclude_invoice, '')
        GROUP BY pil.stock_in_detail_id
      ) inv ON inv.stock_in_detail_id = sid.id
      WHERE si.supplier_number = :supplier_number
        AND si.approval_status = N'已入库'
        AND sid.qualified_quantity - ISNULL(inv.invoiced_qty, 0) > 0
      ORDER BY sid.stock_in_number, sid.line_number
    `, { replacements: { supplier_number, exclude_invoice: (req.query.exclude_invoice as string) || '' } });

    res.json(success(rows));
  } catch (err) { next(err); }
};

// ==================== 根据入库明细查发票 ====================
export const getInvoicesByStockInDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const [rows]: any = await sequelize.query(`
      SELECT pi.invoice_number, pi.invoice_code, pi.invoice_no, pi.invoice_type,
        pi.invoice_date, pi.supplier_name, pi.amount_with_tax, pi.approval_status,
        pil.invoice_quantity, pil.unit_price, pil.amount_without_tax, pil.tax_rate, pil.tax_amount
      FROM purchase_invoice_line pil
      INNER JOIN purchase_invoice pi ON pi.invoice_number = pil.invoice_number
      WHERE pil.stock_in_detail_id = :detailId
      ORDER BY pi.invoice_date DESC
    `, { replacements: { detailId } });
    res.json(success(rows));
  } catch (err) { next(err); }
};

// ==================== 根据采购订单明细查发票 ====================
export const getInvoicesByPurchaseDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const [rows]: any = await sequelize.query(`
      SELECT pi.invoice_number, pi.invoice_code, pi.invoice_no, pi.invoice_type,
        pi.invoice_date, pi.supplier_name, pi.amount_with_tax, pi.approval_status,
        pil.stock_in_number, pil.invoice_quantity, pil.unit_price,
        pil.amount_without_tax, pil.tax_rate, pil.tax_amount
      FROM purchase_invoice_line pil
      INNER JOIN purchase_invoice pi ON pi.invoice_number = pil.invoice_number
      WHERE pil.purchase_detail_id = :detailId
      ORDER BY pi.invoice_date DESC
    `, { replacements: { detailId } });
    res.json(success(rows));
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
export const exportPurchaseInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = 'WHERE 1=1';
    const replacements: any = { search: `%${search}%` };
    if (search) whereClause += ` AND (invoice_number LIKE :search OR supplier_name LIKE :search OR invoice_code LIKE :search OR invoice_no LIKE :search)`;
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) { whereClause += ` AND factory_id = :_factoryId`; replacements._factoryId = _factoryId; }
    const [rows]: any = await sequelize.query(
      `SELECT * FROM purchase_invoice ${whereClause} ORDER BY created_at DESC`,
      { replacements }
    );
    res.json(success(rows, '导出成功'));
  } catch (err) { next(err); }
};
