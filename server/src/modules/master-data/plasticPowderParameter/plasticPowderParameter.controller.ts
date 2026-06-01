import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';

const fields = ['param_name', 'param_code', 'unit', 'remark'];
const headers = ['参数名称', '参数编码', '单位', '备注'];

// 获取塑粉参数列表
export const getPlasticPowderParameters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE param_name LIKE :search OR param_code LIKE :search OR unit LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM plastic_powder_parameter ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY id) AS _row_num FROM plastic_powder_parameter ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取塑粉参数列表成功'));
  } catch (err) { next(err); }
};

// 创建塑粉参数
export const createPlasticPowderParameter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.param_name) { res.status(400).json({ success: false, message: '参数名称不能为空' }); return; }
    if (!b.param_code) { res.status(400).json({ success: false, message: '参数编码不能为空' }); return; }
    // 唯一性校验
    const [dupCode]: any = await sequelize.query(`SELECT id FROM plastic_powder_parameter WHERE param_code = :code`, { replacements: { code: b.param_code } });
    if (dupCode.length > 0) { res.status(400).json({ success: false, message: `参数编码「${b.param_code}」已存在` }); return; }
    const [dupName]: any = await sequelize.query(`SELECT id FROM plastic_powder_parameter WHERE param_name = :name`, { replacements: { name: b.param_name } });
    if (dupName.length > 0) { res.status(400).json({ success: false, message: `参数名称「${b.param_name}」已存在` }); return; }
    await sequelize.query(
      `INSERT INTO plastic_powder_parameter (param_name, param_code, unit, remark, approval_status, creation_date, creation_man)
       VALUES (:param_name, :param_code, :unit, :remark, N'草稿', CONVERT(NVARCHAR(20), GETDATE(), 120), :creation_man)`,
      { replacements: { param_name: b.param_name, param_code: b.param_code, unit: b.unit || '', remark: b.remark || '', creation_man: (req as any).user?.username || '' } }
    );
    res.json(success(null, '创建塑粉参数成功'));
  } catch (err) { next(err); }
};

// 更新塑粉参数
export const updatePlasticPowderParameter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    // 检查审批状态
    const [statusCheck]: any = await sequelize.query(`SELECT approval_status FROM plastic_powder_parameter WHERE id = :id`, { replacements: { id } });
    if (statusCheck.length === 0) { res.status(404).json({ success: false, message: '记录不存在' }); return; }
    if (statusCheck[0].approval_status === '已审批') { res.status(400).json({ success: false, message: '已审批的记录不允许编辑，请先撤审' }); return; }
    if (!b.param_name) { res.status(400).json({ success: false, message: '参数名称不能为空' }); return; }
    if (!b.param_code) { res.status(400).json({ success: false, message: '参数编码不能为空' }); return; }
    // 唯一性校验（排除自身）
    const [dupCode]: any = await sequelize.query(`SELECT id FROM plastic_powder_parameter WHERE param_code = :code AND id != :id`, { replacements: { code: b.param_code, id } });
    if (dupCode.length > 0) { res.status(400).json({ success: false, message: `参数编码「${b.param_code}」已存在` }); return; }
    const [dupName]: any = await sequelize.query(`SELECT id FROM plastic_powder_parameter WHERE param_name = :name AND id != :id`, { replacements: { name: b.param_name, id } });
    if (dupName.length > 0) { res.status(400).json({ success: false, message: `参数名称「${b.param_name}」已存在` }); return; }
    await sequelize.query(
      `UPDATE plastic_powder_parameter SET param_name = :param_name, param_code = :param_code, unit = :unit, remark = :remark WHERE id = :id`,
      { replacements: { id, param_name: b.param_name, param_code: b.param_code, unit: b.unit || '', remark: b.remark || '' } }
    );
    res.json(success(null, '更新塑粉参数成功'));
  } catch (err) { next(err); }
};

// 删除塑粉参数
export const deletePlasticPowderParameter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // 检查审批状态
    const [statusCheck]: any = await sequelize.query(`SELECT approval_status FROM plastic_powder_parameter WHERE id = :id`, { replacements: { id } });
    if (statusCheck.length === 0) { res.status(404).json({ success: false, message: '记录不存在' }); return; }
    if (statusCheck[0].approval_status === '已审批') { res.status(400).json({ success: false, message: '已审批的记录不允许删除，请先撤审' }); return; }
    await sequelize.query(`DELETE FROM plastic_powder_parameter WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '删除塑粉参数成功'));
  } catch (err) { next(err); }
};

// 导出
export const exportPlasticPowderParameters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE param_name LIKE :search OR param_code LIKE :search`; replacements.search = `%${search}%`; }
    const [items]: any = await sequelize.query(`SELECT ${fields.join(', ')} FROM plastic_powder_parameter ${whereClause} ORDER BY id`, { replacements });
    const format = (req.query.format as 'xlsx' | 'xls') || 'xlsx';
    exportToExcel(items, fields, headers, 'plastic-powder-parameters', res, format);
  } catch (err) { next(err); }
};

// 导入
export const importPlasticPowderParameters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    for (const row of rows) {
      if (!row.param_name || !row.param_code) continue;
      await sequelize.query(
        `INSERT INTO plastic_powder_parameter (param_name, param_code, unit, remark, approval_status, creation_date, creation_man)
         VALUES (:param_name, :param_code, :unit, :remark, N'草稿', CONVERT(NVARCHAR(20), GETDATE(), 120), :creation_man)`,
        { replacements: { param_name: row.param_name, param_code: row.param_code, unit: row.unit || '', remark: row.remark || '', creation_man: (req as any).user?.username || '' } }
      );
    }
    res.json(success(null, `成功导入 ${rows.length} 条记录`));
  } catch (err) { next(err); }
};

// 审批
export const approvePlasticPowderParameter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE plastic_powder_parameter SET approval_status = N'已审批' WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '审批成功'));
  } catch (err) { next(err); }
};

// 撤审
export const withdrawPlasticPowderParameter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE plastic_powder_parameter SET approval_status = N'草稿' WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '撤审成功'));
  } catch (err) { next(err); }
};

// 获取全部塑粉参数（下拉选择用）
export const getAllPlasticPowderParameters = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT param_code, param_name, unit FROM plastic_powder_parameter ORDER BY param_code`);
    res.json(success(items, '获取塑粉参数列表成功'));
  } catch (err) { next(err); }
};
