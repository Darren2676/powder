import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';

const fields = ['defect_class_number', 'defect_class_name'];
const headers = ['缺陷分类编号', '缺陷分类名称'];

export const getDefectClasses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE defect_class_number LIKE :search OR defect_class_name LIKE :search`; replacements.search = `%${search}%`; }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM defect_class ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY defect_class_number) AS _row_num FROM defect_class ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取缺陷分类列表成功'));
  } catch (err) { next(err); }
};

export const createDefectClass = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.defect_class_number) { res.status(400).json({ success: false, message: '缺陷分类编号不能为空' }); return; }
    await sequelize.query(`INSERT INTO defect_class (defect_class_number, defect_class_name, approval_status) VALUES (:defect_class_number, :defect_class_name, N'未审核')`, {
      replacements: { defect_class_number: b.defect_class_number, defect_class_name: b.defect_class_name || '' }
    });
    res.json(success(null, '创建缺陷分类成功'));
  } catch (err) { next(err); }
};

export const updateDefectClass = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM defect_class WHERE defect_class_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' }); return; }
    const b = req.body;
    await sequelize.query(`UPDATE defect_class SET defect_class_name = :defect_class_name WHERE defect_class_number = :id`, { replacements: { id, defect_class_name: b.defect_class_name || '' } });
    res.json(success(null, '更新缺陷分类成功'));
  } catch (err) { next(err); }
};

export const deleteDefectClass = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM defect_class WHERE defect_class_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' }); return; }
    await sequelize.query(`DELETE FROM defect_class WHERE defect_class_number = :id`, { replacements: { id } });
    res.json(success(null, '删除缺陷分类成功'));
  } catch (err) { next(err); }
};

export const exportDefectClasses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM defect_class ORDER BY defect_class_number`);
    exportToExcel(items, fields, headers, 'defect_classes', res);
  } catch (err) { next(err); }
};

export const importDefectClasses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let imported = 0;
    for (const item of rows) {
      try {
        await sequelize.query(`INSERT INTO defect_class (defect_class_number, defect_class_name, approval_status) VALUES (:defect_class_number, :defect_class_name, N'未审核')`, {
          replacements: { defect_class_number: item.defect_class_number || '', defect_class_name: item.defect_class_name || '' }
        });
        imported++;
      } catch (e) {}
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};

export const approveDefectClass = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE defect_class SET approval_status = N'已审核' WHERE defect_class_number = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawDefectClass = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE defect_class SET approval_status = N'未审核' WHERE defect_class_number = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};
