import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import path from 'path';
import fs from 'fs';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';

const fields = ['company_number', 'company_name', 'contact_person', 'mobile', 'telephone', 'remark'];
const headers = ['编号', '公司名称', '联系人', '手机', '电话', '备注说明'];

const uploadDir = path.join(__dirname, '../../uploads/logistics-company');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir, { recursive: true }); }

// ========== 列表查询 ==========
export const getLogisticsCompanies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';

    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE company_number LIKE :search OR company_name LIKE :search OR contact_person LIKE :search`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM logistics_company ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(
      `SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY id DESC) AS _row_num FROM logistics_company ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取物流公司列表成功'));
  } catch (err) { next(err); }
};

// ========== 详情查询 ==========
export const getLogisticsCompanyDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(
      `SELECT * FROM logistics_company WHERE company_number = :id`,
      { replacements: { id } }
    );
    if (rows.length === 0) { res.status(404).json({ success: false, message: '物流公司不存在' }); return; }

    const company = rows[0];
    const [attachments]: any = await sequelize.query(
      `SELECT * FROM logistics_company_attachment WHERE company_number = :id ORDER BY uploaded_at DESC`,
      { replacements: { id } }
    );

    res.json(success({ ...company, attachments }, '获取物流公司详情成功'));
  } catch (err) { next(err); }
};

// ========== 新建 ==========
export const createLogisticsCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.company_name) { res.status(400).json({ success: false, message: '公司名称不能为空' }); return; }

    const username = (req as any).user?.username || '';

    // 自动生成编号：查询当前最大编号 +1, 格式 00000001
    let newNumber = '00000001';
    const [maxRows]: any = await sequelize.query(
      `SELECT TOP 1 company_number FROM logistics_company ORDER BY company_number DESC`
    );
    if (maxRows.length > 0) {
      const maxNum = parseInt(maxRows[0].company_number, 10) || 0;
      newNumber = String(maxNum + 1).padStart(8, '0');
    }

    await sequelize.query(
      `INSERT INTO logistics_company (company_number, company_name, contact_person, mobile, telephone, remark, condition, created_by, created_at, updated_at)
       VALUES (:company_number, :company_name, :contact_person, :mobile, :telephone, :remark, N'启用', :created_by, GETDATE(), GETDATE())`,
      {
        replacements: {
          company_number: newNumber,
          company_name: b.company_name,
          contact_person: b.contact_person || '',
          mobile: b.mobile || '',
          telephone: b.telephone || '',
          remark: b.remark || '',
          created_by: username
        }
      }
    );

    res.json(success({ company_number: newNumber }, '新建物流公司成功'));
  } catch (err) { next(err); }
};

// ========== 更新 ==========
export const updateLogisticsCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [chk]: any = await sequelize.query(`SELECT approval_status FROM logistics_company WHERE company_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
      res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' });
      return;
    }

    await sequelize.query(
      `UPDATE logistics_company SET
        company_name = :company_name,
        contact_person = :contact_person,
        mobile = :mobile,
        telephone = :telephone,
        remark = :remark,
        updated_at = GETDATE()
       WHERE company_number = :id`,
      {
        replacements: {
          id,
          company_name: b.company_name || '',
          contact_person: b.contact_person || '',
          mobile: b.mobile || '',
          telephone: b.telephone || '',
          remark: b.remark || ''
        }
      }
    );

    res.json(success(null, '更新物流公司成功'));
  } catch (err) { next(err); }
};

// ========== 删除 ==========
export const deleteLogisticsCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // 删除附件文件
    const [attachments]: any = await sequelize.query(
      `SELECT file_path FROM logistics_company_attachment WHERE company_number = :id`,
      { replacements: { id } }
    );
    for (const att of attachments) {
      const filePath = path.join(__dirname, '../../', att.file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await sequelize.query(`DELETE FROM logistics_company_attachment WHERE company_number = :id`, { replacements: { id } });
    await sequelize.query(`DELETE FROM logistics_company WHERE company_number = :id`, { replacements: { id } });

    res.json(success(null, '删除物流公司成功'));
  } catch (err) { next(err); }
};

// ========== 启用/禁用 ==========
export const updateLogisticsCompanyCondition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { condition } = req.body;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM logistics_company WHERE company_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
      res.status(403).json({ success: false, message: '已审核的记录不允许启用/禁用，请先撤消审核' });
      return;
    }
    await sequelize.query(
      `UPDATE logistics_company SET condition = :condition, updated_at = GETDATE() WHERE company_number = :id`,
      { replacements: { id, condition } }
    );
    res.json(success(null, `物流公司已${condition}`));
  } catch (err) { next(err); }
};

// ========== 审核 ==========
export const approveLogisticsCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(
      `UPDATE logistics_company SET approval_status = N'已审核', updated_at = GETDATE() WHERE company_number = :id`,
      { replacements: { id } }
    );
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

// ========== 撤消审核 ==========
export const withdrawLogisticsCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(
      `UPDATE logistics_company SET approval_status = N'未审核', updated_at = GETDATE() WHERE company_number = :id`,
      { replacements: { id } }
    );
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};

// ========== 附件上传 ==========
export const uploadAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!req.file) { res.status(400).json({ success: false, message: '未上传文件' }); return; }

    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const savedName = `${id}_${Date.now()}${ext}`;
    const savedPath = path.join(uploadDir, savedName);
    fs.writeFileSync(savedPath, req.file.buffer);

    const username = (req as any).user?.username || '';
    await sequelize.query(
      `INSERT INTO logistics_company_attachment (company_number, file_name, file_path, file_size, uploaded_by, uploaded_at)
       VALUES (:company_number, :file_name, :file_path, :file_size, :uploaded_by, GETDATE())`,
      {
        replacements: {
          company_number: id,
          file_name: originalName,
          file_path: `uploads/logistics-company/${savedName}`,
          file_size: req.file.size,
          uploaded_by: username
        }
      }
    );

    res.json(success(null, '附件上传成功'));
  } catch (err) { next(err); }
};

// ========== 附件下载 ==========
export const downloadAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attachmentId } = req.params;
    const [rows]: any = await sequelize.query(
      `SELECT * FROM logistics_company_attachment WHERE id = :attachmentId`,
      { replacements: { attachmentId } }
    );
    if (rows.length === 0) { res.status(404).json({ success: false, message: '附件不存在' }); return; }

    const att = rows[0];
    const filePath = path.join(__dirname, '../../', att.file_path);
    if (!fs.existsSync(filePath)) { res.status(404).json({ success: false, message: '文件不存在' }); return; }

    res.download(filePath, att.file_name);
  } catch (err) { next(err); }
};

// ========== 附件删除 ==========
export const removeAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attachmentId } = req.params;
    const [rows]: any = await sequelize.query(
      `SELECT * FROM logistics_company_attachment WHERE id = :attachmentId`,
      { replacements: { attachmentId } }
    );
    if (rows.length === 0) { res.status(404).json({ success: false, message: '附件不存在' }); return; }

    const att = rows[0];
    const filePath = path.join(__dirname, '../../', att.file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await sequelize.query(`DELETE FROM logistics_company_attachment WHERE id = :attachmentId`, { replacements: { attachmentId } });

    res.json(success(null, '附件删除成功'));
  } catch (err) { next(err); }
};

// ========== 导出 Excel ==========
export const exportLogisticsCompanies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE company_number LIKE :search OR company_name LIKE :search`;
      replacements.search = `%${search}%`;
    }

    const [items]: any = await sequelize.query(
      `SELECT * FROM logistics_company ${whereClause} ORDER BY company_number`,
      { replacements }
    );

    exportToExcel(items, fields, headers, 'logistics_companies', res);
  } catch (err) { next(err); }
};

// ========== 导入 Excel ==========
export const importLogisticsCompanies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    const username = (req as any).user?.username || '';
    let imported = 0;

    for (const row of rows) {
      if (!row.company_name) continue;

      // 如果提供了编号则检查是否存在(更新)，否则自动生成编号(新增)
      if (row.company_number) {
        const [existing]: any = await sequelize.query(
          `SELECT company_number FROM logistics_company WHERE company_number = :cn`,
          { replacements: { cn: row.company_number } }
        );
        if (existing.length > 0) {
          await sequelize.query(
            `UPDATE logistics_company SET company_name = :company_name, contact_person = :contact_person, mobile = :mobile, telephone = :telephone, remark = :remark, updated_at = GETDATE()
             WHERE company_number = :company_number`,
            {
              replacements: {
                company_number: row.company_number,
                company_name: row.company_name || '',
                contact_person: row.contact_person || '',
                mobile: row.mobile || '',
                telephone: row.telephone || '',
                remark: row.remark || ''
              }
            }
          );
        } else {
          await sequelize.query(
            `INSERT INTO logistics_company (company_number, company_name, contact_person, mobile, telephone, remark, condition, created_by, created_at, updated_at)
             VALUES (:company_number, :company_name, :contact_person, :mobile, :telephone, :remark, N'启用', :created_by, GETDATE(), GETDATE())`,
            {
              replacements: {
                company_number: row.company_number,
                company_name: row.company_name || '',
                contact_person: row.contact_person || '',
                mobile: row.mobile || '',
                telephone: row.telephone || '',
                remark: row.remark || '',
                created_by: username
              }
            }
          );
        }
      } else {
        // 自动生成编号
        let newNumber = '00000001';
        const [maxRows]: any = await sequelize.query(
          `SELECT TOP 1 company_number FROM logistics_company ORDER BY company_number DESC`
        );
        if (maxRows.length > 0) {
          const maxNum = parseInt(maxRows[0].company_number, 10) || 0;
          newNumber = String(maxNum + 1).padStart(8, '0');
        }
        await sequelize.query(
          `INSERT INTO logistics_company (company_number, company_name, contact_person, mobile, telephone, remark, condition, created_by, created_at, updated_at)
           VALUES (:company_number, :company_name, :contact_person, :mobile, :telephone, :remark, N'启用', :created_by, GETDATE(), GETDATE())`,
          {
            replacements: {
              company_number: newNumber,
              company_name: row.company_name || '',
              contact_person: row.contact_person || '',
              mobile: row.mobile || '',
              telephone: row.telephone || '',
              remark: row.remark || '',
              created_by: username
            }
          }
        );
      }
      imported++;
    }

    res.json(success({ imported }, `成功导入 ${imported} 条物流公司数据`));
  } catch (err) { next(err); }
};
