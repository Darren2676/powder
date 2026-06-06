import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import path from 'path';
import fs from 'fs';
import { APPROVAL_STATUS, CONDITION_STATUS } from '@/shared/constants/statuses';
import { getFactoryId } from '../../../utils/factoryWhere.util';

const fields = ['customer_number', 'customer_name', 'classification', 'country_code', 'country', 'currency_code', 'industry', 'head_of_sales', 'sales_tax_rate', 'region', 'region2', 'region3', 'region4', 'detail_address', 'zip_code', 'telephone', 'fax', 'linkman', 'area_code', 'contacts', 'email', 'contact_remark', 'bank_account_name', 'bank_name', 'bank_account_number', 'invoice_address', 'invoice_phone', 'invoice_title', 'tax_id', 'payment_terms', 'factory_id'];
const headers = ['客户编号', '客户名称', '分类', '国家（地区）代码', '国家（地区）名称', '币种代码', '行业', '销售负责人', '销售税率', '所在地区1', '所在地区2', '所在地区3', '所在地区4', '详细地址', '邮编', '电话', '传真', '联系人姓名', '区号（+86/+49）', '手机', 'E-mail', '联系人备注', '开户名称', '开户银行', '银行账号', '开票地址', '开票电话', '发票抬头', '纳税人识别码', '付款条件', '所属工厂'];

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../../uploads/customer');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir, { recursive: true }); }

export const getCustomers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(customer_number LIKE :search OR customer_name LIKE :search OR linkman LIKE :search)`);
      replacements.search = `%${search}%`;
    }

    // 数据范围过滤：sales 角色只能看到自己负责的客户
    const scope = (req as any).dataScope;
    if (scope?.head_of_sales_id) {
      conditions.push(`head_of_sales_id = :dataScopeUserId`);
      replacements.dataScopeUserId = scope.head_of_sales_id;
    }

    // 多工厂数据隔离过滤（符合多工厂方案：filter模式下严格隔离，仅显示本工厂记录）
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      conditions.push(`c.factory_id = :_factoryId`);
      replacements._factoryId = _factoryId;
    }

    let whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countSql = `SELECT COUNT(*) as total FROM customer c ${whereClause}`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const total = countResult[0].total;

    const dataSql = `
      SELECT * FROM (
        SELECT c.*, f.factory_name, f.factory_short, ROW_NUMBER() OVER (ORDER BY c.customer_number) AS _row_num
        FROM customer c
        LEFT JOIN factory f ON c.factory_id = f.id
        ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(dataSql, {
      replacements: { ...replacements, offset, offsetEnd: offset + limit }
    });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取客户列表成功'));
  } catch (err) {
    next(err);
  }
};

// ======== 客户详情 ========
export const getCustomerDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM customer WHERE customer_number = :id`, { replacements: { id } });
    if (rows.length === 0) { res.status(404).json({ success: false, message: '客户不存在' }); return; }
    const customer = rows[0];
    // 获取地址列表
    const [addresses]: any = await sequelize.query(`SELECT * FROM customer_address WHERE customer_number = :id ORDER BY id`, { replacements: { id } });
    // 获取附件列表
    const [attachments]: any = await sequelize.query(`SELECT * FROM customer_attachment WHERE customer_number = :id ORDER BY uploaded_at DESC`, { replacements: { id } });
    res.json(success({ ...customer, addresses, attachments }, '获取客户详情成功'));
  } catch (err) { next(err); }
};

// ======== 更新客户状态 (启用/禁用) ========
export const updateCustomerCondition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { condition } = req.body;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM customer WHERE customer_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
      res.status(403).json({ success: false, message: '已审核的记录不允许启用/禁用，请先撤消审核' });
      return;
    }
    await sequelize.query(`UPDATE customer SET condition = :condition, updated_at = GETDATE() WHERE customer_number = :id`, { replacements: { id, condition } });
    res.json(success(null, `客户已${condition}`));
  } catch (err) { next(err); }
};

export const approveCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE customer SET approval_status = N'已审核', updated_at = GETDATE() WHERE customer_number = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE customer SET approval_status = N'未审核', updated_at = GETDATE() WHERE customer_number = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};

export const createCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;

    if (!b.customer_number) {
      res.status(400).json({ success: false, message: '客户编号不能为空' });
      return;
    }

    const username = (req as any).user?.username || '';
    const userId = (req as any).user?.id || null;
    // 如果前端未传 head_of_sales_id 且当前用户是 sales 角色，自动填入当前用户 id
    const head_of_sales_id = b.head_of_sales_id || (req.user?.role === 'sales' ? userId : null);
    // 如果前端未传 head_of_sales 且有 head_of_sales_id，自动从用户信息取姓名
    const head_of_sales = b.head_of_sales || (head_of_sales_id ? (req as any).user?.real_name || '' : '');
    const insertSql = `
      INSERT INTO customer (customer_number, customer_name, classification, country_code, country, currency_code, industry, head_of_sales, sales_tax_rate, head_of_sales_id,
        region, region2, region3, region4, detail_address, zip_code, telephone, fax,
        linkman, area_code, contacts, email, contact_remark,
        bank_account_name, bank_name, bank_account_number, invoice_address, invoice_phone, invoice_title, tax_id, payment_terms,
        factory_id, condition, created_by, created_at, updated_at)
      VALUES (:customer_number, :customer_name, :classification, :country_code, :country, :currency_code, :industry, :head_of_sales, :sales_tax_rate, :head_of_sales_id,
        :region, :region2, :region3, :region4, :detail_address, :zip_code, :telephone, :fax,
        :linkman, :area_code, :contacts, :email, :contact_remark,
        :bank_account_name, :bank_name, :bank_account_number, :invoice_address, :invoice_phone, :invoice_title, :tax_id, :payment_terms,
        :factory_id, :condition, :created_by, GETDATE(), GETDATE())
    `;

    await sequelize.query(insertSql, {
      replacements: {
        customer_number: b.customer_number,
        customer_name: b.customer_name || '', classification: b.classification || '', country_code: b.country_code || '',
        country: b.country || '', currency_code: b.currency_code || '', industry: b.industry || '',
        head_of_sales, sales_tax_rate: b.sales_tax_rate || 0,
        head_of_sales_id,
        region: b.region || '', region2: b.region2 || '', region3: b.region3 || '', region4: b.region4 || '',
        detail_address: b.detail_address || '', zip_code: b.zip_code || '', telephone: b.telephone || '', fax: b.fax || '',
        linkman: b.linkman || '', area_code: b.area_code || '', contacts: b.contacts || '',
        email: b.email || '', contact_remark: b.contact_remark || '',
        bank_account_name: b.bank_account_name || '', bank_name: b.bank_name || '', bank_account_number: b.bank_account_number || '',
        invoice_address: b.invoice_address || '', invoice_phone: b.invoice_phone || '',
        invoice_title: b.invoice_title || '', tax_id: b.tax_id || '', payment_terms: b.payment_terms || '',
        factory_id: b.factory_id || null,
        condition: b.condition || CONDITION_STATUS.ENABLED, created_by: username
      }
    });

    // 如果有地址数据，一起插入
    if (b.addresses && Array.isArray(b.addresses)) {
      for (const addr of b.addresses) {
        await sequelize.query(`
          INSERT INTO customer_address (customer_number, address_type, region, detail_address, receiver, mobile, telephone, fax)
          VALUES (:customer_number, :address_type, :region, :detail_address, :receiver, :mobile, :telephone, :fax)
        `, {
          replacements: {
            customer_number: b.customer_number,
            address_type: addr.address_type || '公司地址',
            region: addr.region || '', detail_address: addr.detail_address || '',
            receiver: addr.receiver || '', mobile: addr.mobile || '',
            telephone: addr.telephone || '', fax: addr.fax || ''
          }
        });
      }
    }

    res.json(success(null, '创建客户成功'));
  } catch (err) {
    next(err);
  }
};

export const updateCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [chk]: any = await sequelize.query(`SELECT approval_status FROM customer WHERE customer_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
      res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' });
      return;
    }

    const updateSql = `
      UPDATE customer SET
        customer_name = :customer_name, classification = :classification, country_code = :country_code,
        country = :country, currency_code = :currency_code, industry = :industry,
        head_of_sales = :head_of_sales, sales_tax_rate = :sales_tax_rate, head_of_sales_id = :head_of_sales_id,
        region = :region, region2 = :region2, region3 = :region3, region4 = :region4,
        detail_address = :detail_address, zip_code = :zip_code, telephone = :telephone, fax = :fax,
        linkman = :linkman, area_code = :area_code, contacts = :contacts,
        email = :email, contact_remark = :contact_remark,
        bank_account_name = :bank_account_name, bank_name = :bank_name, bank_account_number = :bank_account_number,
        invoice_address = :invoice_address, invoice_phone = :invoice_phone,
        invoice_title = :invoice_title, tax_id = :tax_id, payment_terms = :payment_terms,
        factory_id = :factory_id,
        updated_at = GETDATE()
      WHERE customer_number = :id
    `;

    await sequelize.query(updateSql, {
      replacements: {
        id,
        customer_name: b.customer_name, classification: b.classification, country_code: b.country_code,
        country: b.country, currency_code: b.currency_code, industry: b.industry,
        head_of_sales: b.head_of_sales, sales_tax_rate: b.sales_tax_rate || 0,
        head_of_sales_id: b.head_of_sales_id || null,
        region: b.region, region2: b.region2, region3: b.region3, region4: b.region4,
        detail_address: b.detail_address, zip_code: b.zip_code, telephone: b.telephone, fax: b.fax,
        linkman: b.linkman, area_code: b.area_code, contacts: b.contacts,
        email: b.email, contact_remark: b.contact_remark,
        bank_account_name: b.bank_account_name, bank_name: b.bank_name, bank_account_number: b.bank_account_number,
        invoice_address: b.invoice_address, invoice_phone: b.invoice_phone,
        invoice_title: b.invoice_title, tax_id: b.tax_id, payment_terms: b.payment_terms,
        factory_id: b.factory_id || null
      }
    });

    // 如果传了地址数据，先删后插
    if (b.addresses && Array.isArray(b.addresses)) {
      await sequelize.query(`DELETE FROM customer_address WHERE customer_number = :id`, { replacements: { id } });
      for (const addr of b.addresses) {
        await sequelize.query(`
          INSERT INTO customer_address (customer_number, address_type, region, detail_address, receiver, mobile, telephone, fax)
          VALUES (:customer_number, :address_type, :region, :detail_address, :receiver, :mobile, :telephone, :fax)
        `, {
          replacements: {
            customer_number: id,
            address_type: addr.address_type || '公司地址',
            region: addr.region || '', detail_address: addr.detail_address || '',
            receiver: addr.receiver || '', mobile: addr.mobile || '',
            telephone: addr.telephone || '', fax: addr.fax || ''
          }
        });
      }
    }

    res.json(success(null, '更新客户成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // 删除关联数据
    await sequelize.query(`DELETE FROM customer_address WHERE customer_number = :id`, { replacements: { id } });
    await sequelize.query(`DELETE FROM customer_attachment WHERE customer_number = :id`, { replacements: { id } });
    await sequelize.query(`DELETE FROM customer WHERE customer_number = :id`, { replacements: { id } });
    res.json(success(null, '删除客户成功'));
  } catch (err) {
    next(err);
  }
};

export const exportCustomers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM customer ORDER BY customer_number`);
    exportToExcel(items, fields, headers, 'customers', res);
  } catch (err) {
    next(err);
  }
};

export const importCustomers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: '请上传Excel文件' });
      return;
    }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) {
      res.status(400).json({ success: false, message: 'Excel文件内容为空' });
      return;
    }

    const username = (req as any).user?.username || '';
    let imported = 0;
    let updated = 0;
    for (const item of rows) {
      if (!item.customer_number) continue;
      try {
        const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM customer WHERE customer_number = :cn`, { replacements: { cn: item.customer_number } });
        if (existing[0].cnt > 0) {
          await sequelize.query(`
            UPDATE customer SET
              customer_name = :customer_name, classification = :classification, country_code = :country_code,
              country = :country, currency_code = :currency_code, industry = :industry,
              head_of_sales = :head_of_sales, sales_tax_rate = :sales_tax_rate,
              region = :region, region2 = :region2, region3 = :region3, region4 = :region4,
              detail_address = :detail_address, zip_code = :zip_code, telephone = :telephone, fax = :fax,
              linkman = :linkman, area_code = :area_code, contacts = :contacts,
              email = :email, contact_remark = :contact_remark,
              bank_account_name = :bank_account_name, bank_name = :bank_name, bank_account_number = :bank_account_number,
              invoice_address = :invoice_address, invoice_phone = :invoice_phone,
              invoice_title = :invoice_title, tax_id = :tax_id, payment_terms = :payment_terms,
              factory_id = :factory_id,
              updated_at = GETDATE()
            WHERE customer_number = :customer_number
          `, {
            replacements: {
              customer_number: item.customer_number,
              customer_name: item.customer_name || '', classification: item.classification || '', country_code: item.country_code || '',
              country: item.country || '', currency_code: item.currency_code || '', industry: item.industry || '',
              head_of_sales: item.head_of_sales || '', sales_tax_rate: item.sales_tax_rate || 0,
              region: item.region || '', region2: item.region2 || '', region3: item.region3 || '', region4: item.region4 || '',
              detail_address: item.detail_address || '', zip_code: item.zip_code || '', telephone: item.telephone || '', fax: item.fax || '',
              linkman: item.linkman || '', area_code: item.area_code || '', contacts: item.contacts || '',
              email: item.email || '', contact_remark: item.contact_remark || '',
              bank_account_name: item.bank_account_name || '', bank_name: item.bank_name || '', bank_account_number: item.bank_account_number || '',
              invoice_address: item.invoice_address || '', invoice_phone: item.invoice_phone || '',
              invoice_title: item.invoice_title || '', tax_id: item.tax_id || '', payment_terms: item.payment_terms || '',
              factory_id: item.factory_id || null
            }
          });
          updated++;
        } else {
          await sequelize.query(`
            INSERT INTO customer (customer_number, customer_name, classification, country_code, country, currency_code, industry, head_of_sales, sales_tax_rate,
              region, region2, region3, region4, detail_address, zip_code, telephone, fax,
              linkman, area_code, contacts, email, contact_remark,
              bank_account_name, bank_name, bank_account_number, invoice_address, invoice_phone, invoice_title, tax_id, payment_terms,
              factory_id, condition, created_by, created_at, updated_at)
            VALUES (:customer_number, :customer_name, :classification, :country_code, :country, :currency_code, :industry, :head_of_sales, :sales_tax_rate,
              :region, :region2, :region3, :region4, :detail_address, :zip_code, :telephone, :fax,
              :linkman, :area_code, :contacts, :email, :contact_remark,
              :bank_account_name, :bank_name, :bank_account_number, :invoice_address, :invoice_phone, :invoice_title, :tax_id, :payment_terms,
              :factory_id, N'启用', :created_by, GETDATE(), GETDATE())
          `, {
            replacements: {
              customer_number: item.customer_number, customer_name: item.customer_name || '',
              classification: item.classification || '', country_code: item.country_code || '',
              country: item.country || '', currency_code: item.currency_code || '', industry: item.industry || '',
              head_of_sales: item.head_of_sales || '', sales_tax_rate: item.sales_tax_rate || 0,
              region: item.region || '', region2: item.region2 || '', region3: item.region3 || '', region4: item.region4 || '',
              detail_address: item.detail_address || '', zip_code: item.zip_code || '', telephone: item.telephone || '', fax: item.fax || '',
              linkman: item.linkman || '', area_code: item.area_code || '', contacts: item.contacts || '',
              email: item.email || '', contact_remark: item.contact_remark || '',
              bank_account_name: item.bank_account_name || '', bank_name: item.bank_name || '', bank_account_number: item.bank_account_number || '',
              invoice_address: item.invoice_address || '', invoice_phone: item.invoice_phone || '',
              invoice_title: item.invoice_title || '', tax_id: item.tax_id || '', payment_terms: item.payment_terms || '',
              factory_id: item.factory_id || null,
              created_by: username
            }
          });
          imported++;
        }
      } catch (e) { /* skip */ }
    }

    res.json(success({ imported, updated, totalCount: rows.length }, `成功导入 ${imported} 条，更新 ${updated} 条`));
  } catch (err) {
    next(err);
  }
};

// ======== 客户地址 CRUD ========
export const addCustomerAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    await sequelize.query(`
      INSERT INTO customer_address (customer_number, address_type, region, detail_address, receiver, mobile, telephone, fax)
      VALUES (:customer_number, :address_type, :region, :detail_address, :receiver, :mobile, :telephone, :fax)
    `, {
      replacements: {
        customer_number: id,
        address_type: b.address_type || '公司地址',
        region: b.region || '', detail_address: b.detail_address || '',
        receiver: b.receiver || '', mobile: b.mobile || '',
        telephone: b.telephone || '', fax: b.fax || ''
      }
    });
    res.json(success(null, '添加地址成功'));
  } catch (err) { next(err); }
};

export const updateCustomerAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { addressId } = req.params;
    const b = req.body;
    await sequelize.query(`
      UPDATE customer_address SET
        address_type = :address_type, region = :region, detail_address = :detail_address,
        receiver = :receiver, mobile = :mobile, telephone = :telephone, fax = :fax
      WHERE id = :addressId
    `, {
      replacements: {
        addressId,
        address_type: b.address_type || '公司地址',
        region: b.region || '', detail_address: b.detail_address || '',
        receiver: b.receiver || '', mobile: b.mobile || '',
        telephone: b.telephone || '', fax: b.fax || ''
      }
    });
    res.json(success(null, '更新地址成功'));
  } catch (err) { next(err); }
};

export const removeCustomerAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { addressId } = req.params;
    await sequelize.query(`DELETE FROM customer_address WHERE id = :addressId`, { replacements: { addressId } });
    res.json(success(null, '删除地址成功'));
  } catch (err) { next(err); }
};

// ======== 客户附件 ========
export const uploadCustomerAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!req.file) { res.status(400).json({ success: false, message: '请上传文件' }); return; }
    const username = (req as any).user?.username || '';
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const fileName = `${id}_${Date.now()}${ext}`;
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, req.file.buffer);
    await sequelize.query(`
      INSERT INTO customer_attachment (customer_number, file_name, file_path, file_size, uploaded_by, uploaded_at)
      VALUES (:customer_number, :file_name, :file_path, :file_size, :uploaded_by, GETDATE())
    `, {
      replacements: {
        customer_number: id,
        file_name: originalName,
        file_path: fileName,
        file_size: req.file.size,
        uploaded_by: username
      }
    });
    res.json(success(null, '上传成功'));
  } catch (err) { next(err); }
};

export const downloadCustomerAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attachmentId } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM customer_attachment WHERE id = :attachmentId`, { replacements: { attachmentId } });
    if (rows.length === 0) { res.status(404).json({ success: false, message: '附件不存在' }); return; }
    const attachment = rows[0];
    const filePath = path.join(uploadDir, attachment.file_path);
    if (!fs.existsSync(filePath)) { res.status(404).json({ success: false, message: '文件不存在' }); return; }
    res.download(filePath, attachment.file_name);
  } catch (err) { next(err); }
};

export const removeCustomerAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attachmentId } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM customer_attachment WHERE id = :attachmentId`, { replacements: { attachmentId } });
    if (rows.length > 0) {
      const filePath = path.join(uploadDir, rows[0].file_path);
      if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
    }
    await sequelize.query(`DELETE FROM customer_attachment WHERE id = :attachmentId`, { replacements: { attachmentId } });
    res.json(success(null, '删除附件成功'));
  } catch (err) { next(err); }
};
