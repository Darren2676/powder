import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';

const fields = ['category_code', 'category_name', 'remark'];
const headers = ['分类编码', '分类名称', '备注'];

// 获取工艺分类列表
export const getPlasticProcessCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE category_code LIKE :search OR category_name LIKE :search OR remark LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM plastic_process_category ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY category_code) AS _row_num FROM plastic_process_category ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取工艺分类列表成功'));
  } catch (err) { next(err); }
};

// 创建工艺分类
export const createPlasticProcessCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.category_code) { res.status(400).json({ success: false, message: '分类编码不能为空' }); return; }
    if (!b.category_name) { res.status(400).json({ success: false, message: '分类名称不能为空' }); return; }
    const [dupCode]: any = await sequelize.query(`SELECT id FROM plastic_process_category WHERE category_code = :code`, { replacements: { code: b.category_code } });
    if (dupCode.length > 0) { res.status(400).json({ success: false, message: `分类编码「${b.category_code}」已存在` }); return; }
    const [dupName]: any = await sequelize.query(`SELECT id FROM plastic_process_category WHERE category_name = :name`, { replacements: { name: b.category_name } });
    if (dupName.length > 0) { res.status(400).json({ success: false, message: `分类名称「${b.category_name}」已存在` }); return; }
    await sequelize.query(
      `INSERT INTO plastic_process_category (category_code, category_name, remark, approval_status, creation_date, creation_man)
       VALUES (:category_code, :category_name, :remark, N'草稿', CONVERT(NVARCHAR(20), GETDATE(), 120), :creation_man)`,
      { replacements: { category_code: b.category_code, category_name: b.category_name, remark: b.remark || '', creation_man: (req as any).user?.username || '' } }
    );
    res.json(success(null, '创建工艺分类成功'));
  } catch (err) { next(err); }
};

// 更新工艺分类
export const updatePlasticProcessCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const [statusCheck]: any = await sequelize.query(`SELECT approval_status FROM plastic_process_category WHERE id = :id`, { replacements: { id } });
    if (statusCheck.length === 0) { res.status(404).json({ success: false, message: '记录不存在' }); return; }
    if (statusCheck[0].approval_status === '已审批') { res.status(400).json({ success: false, message: '已审批的记录不允许编辑，请先撤审' }); return; }
    if (!b.category_code) { res.status(400).json({ success: false, message: '分类编码不能为空' }); return; }
    if (!b.category_name) { res.status(400).json({ success: false, message: '分类名称不能为空' }); return; }
    const [dupCode]: any = await sequelize.query(`SELECT id FROM plastic_process_category WHERE category_code = :code AND id != :id`, { replacements: { code: b.category_code, id } });
    if (dupCode.length > 0) { res.status(400).json({ success: false, message: `分类编码「${b.category_code}」已存在` }); return; }
    const [dupName]: any = await sequelize.query(`SELECT id FROM plastic_process_category WHERE category_name = :name AND id != :id`, { replacements: { name: b.category_name, id } });
    if (dupName.length > 0) { res.status(400).json({ success: false, message: `分类名称「${b.category_name}」已存在` }); return; }
    await sequelize.query(
      `UPDATE plastic_process_category SET category_code = :category_code, category_name = :category_name, remark = :remark WHERE id = :id`,
      { replacements: { id, category_code: b.category_code, category_name: b.category_name, remark: b.remark || '' } }
    );
    res.json(success(null, '更新工艺分类成功'));
  } catch (err) { next(err); }
};

// 删除工艺分类
export const deletePlasticProcessCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [statusCheck]: any = await sequelize.query(`SELECT approval_status FROM plastic_process_category WHERE id = :id`, { replacements: { id } });
    if (statusCheck.length === 0) { res.status(404).json({ success: false, message: '记录不存在' }); return; }
    if (statusCheck[0].approval_status === '已审批') { res.status(400).json({ success: false, message: '已审批的记录不允许删除，请先撤审' }); return; }
    await sequelize.query(`DELETE FROM plastic_process_category WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '删除工艺分类成功'));
  } catch (err) { next(err); }
};

// 导出
export const exportPlasticProcessCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE category_code LIKE :search OR category_name LIKE :search`; replacements.search = `%${search}%`; }
    const [items]: any = await sequelize.query(`SELECT ${fields.join(', ')} FROM plastic_process_category ${whereClause} ORDER BY category_code`, { replacements });
    const format = (req.query.format as 'xlsx' | 'xls') || 'xlsx';
    exportToExcel(items, fields, headers, 'plastic-process-categories', res, format);
  } catch (err) { next(err); }
};

// 导入
export const importPlasticProcessCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    for (const row of rows) {
      if (!row.category_code || !row.category_name) continue;
      await sequelize.query(
        `INSERT INTO plastic_process_category (category_code, category_name, remark, approval_status, creation_date, creation_man)
         VALUES (:category_code, :category_name, :remark, N'草稿', CONVERT(NVARCHAR(20), GETDATE(), 120), :creation_man)`,
        { replacements: { category_code: row.category_code, category_name: row.category_name, remark: row.remark || '', creation_man: (req as any).user?.username || '' } }
      );
    }
    res.json(success(null, `成功导入 ${rows.length} 条记录`));
  } catch (err) { next(err); }
};

// 审批
export const approvePlasticProcessCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE plastic_process_category SET approval_status = N'已审批' WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '审批成功'));
  } catch (err) { next(err); }
};

// 撤审
export const withdrawPlasticProcessCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE plastic_process_category SET approval_status = N'草稿' WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '撤审成功'));
  } catch (err) { next(err); }
};

// 获取全部工艺分类（下拉选择用）
export const getAllPlasticProcessCategories = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT category_code, category_name FROM plastic_process_category ORDER BY category_code`);
    res.json(success(items, '获取工艺分类列表成功'));
  } catch (err) { next(err); }
};
