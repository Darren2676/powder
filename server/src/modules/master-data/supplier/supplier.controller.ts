import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import path from 'path';
import fs from 'fs';
import { APPROVAL_STATUS, CONDITION_STATUS } from '@/shared/constants/statuses';

const fields = ['supplier_number', 'supplier_name', 'classification', 'country', 'currency_code', 'purchase_tax_rate', 'industry', 'supplier_manager', 'procurement_manager', 'linkman', 'mobile', 'contacts', 'region', 'detail_address', 'zip_code', 'telephone', 'fax', 'email', 'contact_remark', 'bank_account_name', 'bank_name', 'bank_account_number', 'invoice_address', 'invoice_phone', 'invoice_title', 'tax_id', 'payment_terms'];
const headers = ['供应商编号', '供应商名称', '分类', '国家（地区）', '币种代码', '采购税率', '行业', '供应商负责人', '采购经理', '联系人', '手机', '联系方式', '所在地区', '详细地址', '邮编', '电话', '传真', 'E-mail', '备注', '开户名称', '开户银行', '银行账号', '开票地址', '开票电话', '发票抬头', '纳税人识别码', '付款条件'];

const uploadDir = path.join(__dirname, '../../uploads/supplier');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir, { recursive: true }); }

const allFields = 'supplier_number, supplier_name, classification, country, currency_code, purchase_tax_rate, industry, supplier_manager, procurement_manager, linkman, mobile, contacts, region, detail_address, zip_code, telephone, fax, email, contact_remark, bank_account_name, bank_name, bank_account_number, invoice_address, invoice_phone, invoice_title, tax_id, payment_terms, condition, created_by, created_at, updated_at';

function buildReplacements(b: any, username?: string) {
  return {
    supplier_number: b.supplier_number,
    supplier_name: b.supplier_name || '', classification: b.classification || '', country: b.country || '',
    currency_code: b.currency_code || '', purchase_tax_rate: b.purchase_tax_rate || 0, industry: b.industry || '',
    supplier_manager: b.supplier_manager || '', procurement_manager: b.procurement_manager || '',
    linkman: b.linkman || '', mobile: b.mobile || '', contacts: b.contacts || '',
    region: b.region || '', detail_address: b.detail_address || '', zip_code: b.zip_code || '',
    telephone: b.telephone || '', fax: b.fax || '', email: b.email || '', contact_remark: b.contact_remark || '',
    bank_account_name: b.bank_account_name || '', bank_name: b.bank_name || '', bank_account_number: b.bank_account_number || '',
    invoice_address: b.invoice_address || '', invoice_phone: b.invoice_phone || '',
    invoice_title: b.invoice_title || '', tax_id: b.tax_id || '', payment_terms: b.payment_terms || '',
    ...(username !== undefined ? { condition: b.condition || CONDITION_STATUS.ENABLED, created_by: username } : {})
  };
}

export const getSuppliers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE supplier_number LIKE :search OR supplier_name LIKE :search OR linkman LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM supplier ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY supplier_number) AS _row_num FROM supplier ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取供应商列表成功'));
  } catch (err) { next(err); }
};

export const getSupplierDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM supplier WHERE supplier_number = :id`, { replacements: { id } });
    if (rows.length === 0) { res.status(404).json({ success: false, message: '供应商不存在' }); return; }
    const supplier = rows[0];
    const [addresses]: any = await sequelize.query(`SELECT * FROM supplier_address WHERE supplier_number = :id ORDER BY id`, { replacements: { id } });
    const [attachments]: any = await sequelize.query(`SELECT * FROM supplier_attachment WHERE supplier_number = :id ORDER BY uploaded_at DESC`, { replacements: { id } });
    res.json(success({ ...supplier, addresses, attachments }, '获取供应商详情成功'));
  } catch (err) { next(err); }
};

export const updateSupplierCondition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { condition } = req.body;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM supplier WHERE supplier_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
      res.status(403).json({ success: false, message: '已审核的记录不允许启用/禁用，请先撤消审核' });
      return;
    }
    await sequelize.query(`UPDATE supplier SET condition = :condition, updated_at = GETDATE() WHERE supplier_number = :id`, { replacements: { id, condition } });
    res.json(success(null, `供应商已${condition}`));
  } catch (err) { next(err); }
};

export const approveSupplier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE supplier SET approval_status = N'已审核', updated_at = GETDATE() WHERE supplier_number = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawSupplier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE supplier SET approval_status = N'未审核', updated_at = GETDATE() WHERE supplier_number = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};

export const createSupplier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.supplier_number) { res.status(400).json({ success: false, message: '供应商编号不能为空' }); return; }
    const username = (req as any).user?.username || '';
    const r = buildReplacements(b, username);
    await sequelize.query(`
      INSERT INTO supplier (${allFields})
      VALUES (:supplier_number, :supplier_name, :classification, :country, :currency_code, :purchase_tax_rate, :industry, :supplier_manager, :procurement_manager, :linkman, :mobile, :contacts, :region, :detail_address, :zip_code, :telephone, :fax, :email, :contact_remark, :bank_account_name, :bank_name, :bank_account_number, :invoice_address, :invoice_phone, :invoice_title, :tax_id, :payment_terms, :condition, :created_by, GETDATE(), GETDATE())
    `, { replacements: r });
    if (b.addresses && Array.isArray(b.addresses)) {
      for (const addr of b.addresses) {
        await sequelize.query(`INSERT INTO supplier_address (supplier_number, address_type, region, detail_address, contact_person, mobile, telephone, fax) VALUES (:sn, :at, :r, :da, :cp, :m, :t, :f)`, {
          replacements: { sn: b.supplier_number, at: addr.address_type || '公司地址', r: addr.region || '', da: addr.detail_address || '', cp: addr.contact_person || '', m: addr.mobile || '', t: addr.telephone || '', f: addr.fax || '' }
        });
      }
    }
    res.json(success(null, '创建供应商成功'));
  } catch (err) { next(err); }
};

export const updateSupplier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM supplier WHERE supplier_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
      res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' });
      return;
    }
    const r = buildReplacements(b);
    await sequelize.query(`
      UPDATE supplier SET
        supplier_name = :supplier_name, classification = :classification, country = :country,
        currency_code = :currency_code, purchase_tax_rate = :purchase_tax_rate, industry = :industry,
        supplier_manager = :supplier_manager, procurement_manager = :procurement_manager,
        linkman = :linkman, mobile = :mobile, contacts = :contacts,
        region = :region, detail_address = :detail_address, zip_code = :zip_code,
        telephone = :telephone, fax = :fax, email = :email, contact_remark = :contact_remark,
        bank_account_name = :bank_account_name, bank_name = :bank_name, bank_account_number = :bank_account_number,
        invoice_address = :invoice_address, invoice_phone = :invoice_phone,
        invoice_title = :invoice_title, tax_id = :tax_id, payment_terms = :payment_terms,
        updated_at = GETDATE()
      WHERE supplier_number = :id
    `, { replacements: { ...r, id } });
    if (b.addresses && Array.isArray(b.addresses)) {
      await sequelize.query(`DELETE FROM supplier_address WHERE supplier_number = :id`, { replacements: { id } });
      for (const addr of b.addresses) {
        await sequelize.query(`INSERT INTO supplier_address (supplier_number, address_type, region, detail_address, contact_person, mobile, telephone, fax) VALUES (:sn, :at, :r, :da, :cp, :m, :t, :f)`, {
          replacements: { sn: id, at: addr.address_type || '公司地址', r: addr.region || '', da: addr.detail_address || '', cp: addr.contact_person || '', m: addr.mobile || '', t: addr.telephone || '', f: addr.fax || '' }
        });
      }
    }
    res.json(success(null, '更新供应商成功'));
  } catch (err) { next(err); }
};

export const deleteSupplier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM supplier_address WHERE supplier_number = :id`, { replacements: { id } });
    await sequelize.query(`DELETE FROM supplier_attachment WHERE supplier_number = :id`, { replacements: { id } });
    await sequelize.query(`DELETE FROM supplier WHERE supplier_number = :id`, { replacements: { id } });
    res.json(success(null, '删除供应商成功'));
  } catch (err) { next(err); }
};

export const exportSuppliers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM supplier ORDER BY supplier_number`);
    exportToExcel(items, fields, headers, 'suppliers', res);
  } catch (err) { next(err); }
};

export const importSuppliers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    const username = (req as any).user?.username || '';
    let imported = 0, updated = 0;
    for (const item of rows) {
      if (!item.supplier_number) continue;
      try {
        const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM supplier WHERE supplier_number = :sn`, { replacements: { sn: item.supplier_number } });
        const r = buildReplacements(item);
        if (existing[0].cnt > 0) {
          await sequelize.query(`
            UPDATE supplier SET supplier_name = :supplier_name, classification = :classification, country = :country, currency_code = :currency_code, purchase_tax_rate = :purchase_tax_rate, industry = :industry, supplier_manager = :supplier_manager, procurement_manager = :procurement_manager, linkman = :linkman, mobile = :mobile, contacts = :contacts, region = :region, detail_address = :detail_address, zip_code = :zip_code, telephone = :telephone, fax = :fax, email = :email, contact_remark = :contact_remark, bank_account_name = :bank_account_name, bank_name = :bank_name, bank_account_number = :bank_account_number, invoice_address = :invoice_address, invoice_phone = :invoice_phone, invoice_title = :invoice_title, tax_id = :tax_id, payment_terms = :payment_terms, updated_at = GETDATE() WHERE supplier_number = :supplier_number
          `, { replacements: r });
          updated++;
        } else {
          await sequelize.query(`
            INSERT INTO supplier (${allFields}) VALUES (:supplier_number, :supplier_name, :classification, :country, :currency_code, :purchase_tax_rate, :industry, :supplier_manager, :procurement_manager, :linkman, :mobile, :contacts, :region, :detail_address, :zip_code, :telephone, :fax, :email, :contact_remark, :bank_account_name, :bank_name, :bank_account_number, :invoice_address, :invoice_phone, :invoice_title, :tax_id, :payment_terms, N'启用', :created_by, GETDATE(), GETDATE())
          `, { replacements: { ...r, condition: CONDITION_STATUS.ENABLED, created_by: username } });
          imported++;
        }
      } catch (e) { /* skip */ }
    }
    res.json(success({ imported, updated, totalCount: rows.length }, `成功导入 ${imported} 条，更新 ${updated} 条`));
  } catch (err) { next(err); }
};

// ======== 地址 CRUD ========
export const addSupplierAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; const b = req.body;
    await sequelize.query(`INSERT INTO supplier_address (supplier_number, address_type, region, detail_address, contact_person, mobile, telephone, fax) VALUES (:sn, :at, :r, :da, :cp, :m, :t, :f)`, {
      replacements: { sn: id, at: b.address_type || '公司地址', r: b.region || '', da: b.detail_address || '', cp: b.contact_person || '', m: b.mobile || '', t: b.telephone || '', f: b.fax || '' }
    });
    res.json(success(null, '添加地址成功'));
  } catch (err) { next(err); }
};

export const updateSupplierAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { addressId } = req.params; const b = req.body;
    await sequelize.query(`UPDATE supplier_address SET address_type = :at, region = :r, detail_address = :da, contact_person = :cp, mobile = :m, telephone = :t, fax = :f WHERE id = :id`, {
      replacements: { id: addressId, at: b.address_type || '公司地址', r: b.region || '', da: b.detail_address || '', cp: b.contact_person || '', m: b.mobile || '', t: b.telephone || '', f: b.fax || '' }
    });
    res.json(success(null, '更新地址成功'));
  } catch (err) { next(err); }
};

export const removeSupplierAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { addressId } = req.params;
    await sequelize.query(`DELETE FROM supplier_address WHERE id = :addressId`, { replacements: { addressId } });
    res.json(success(null, '删除地址成功'));
  } catch (err) { next(err); }
};

// ======== 附件 ========
export const uploadSupplierAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!req.file) { res.status(400).json({ success: false, message: '请上传文件' }); return; }
    const username = (req as any).user?.username || '';
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const fileName = `${id}_${Date.now()}${ext}`;
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, req.file.buffer);
    await sequelize.query(`INSERT INTO supplier_attachment (supplier_number, file_name, file_path, file_size, uploaded_by, uploaded_at) VALUES (:sn, :fn, :fp, :fs, :ub, GETDATE())`, {
      replacements: { sn: id, fn: originalName, fp: fileName, fs: req.file.size, ub: username }
    });
    res.json(success(null, '上传成功'));
  } catch (err) { next(err); }
};

export const downloadSupplierAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attachmentId } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM supplier_attachment WHERE id = :attachmentId`, { replacements: { attachmentId } });
    if (rows.length === 0) { res.status(404).json({ success: false, message: '附件不存在' }); return; }
    const att = rows[0];
    const filePath = path.join(uploadDir, att.file_path);
    if (!fs.existsSync(filePath)) { res.status(404).json({ success: false, message: '文件不存在' }); return; }
    res.download(filePath, att.file_name);
  } catch (err) { next(err); }
};

export const removeSupplierAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attachmentId } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM supplier_attachment WHERE id = :attachmentId`, { replacements: { attachmentId } });
    if (rows.length > 0) { const fp = path.join(uploadDir, rows[0].file_path); if (fs.existsSync(fp)) { fs.unlinkSync(fp); } }
    await sequelize.query(`DELETE FROM supplier_attachment WHERE id = :attachmentId`, { replacements: { attachmentId } });
    res.json(success(null, '删除附件成功'));
  } catch (err) { next(err); }
};
