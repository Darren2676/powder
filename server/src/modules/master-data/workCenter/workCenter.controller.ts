import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';

const fields = ['work_cente_number', 'work_cente_name', 'condition', 'remark'];
const headers = ['工作中心编号', '工作中心名称', '状态', '备注'];

export const getWorkCenters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE work_cente_number LIKE :search OR work_cente_name LIKE :search`; replacements.search = `%${search}%`; }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM work_center ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY work_cente_number) AS _row_num FROM work_center ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取工作中心列表成功'));
  } catch (err) { next(err); }
};

export const createWorkCenter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.work_cente_number) { res.status(400).json({ success: false, message: '工作中心编号不能为空' }); return; }
    await sequelize.query(`INSERT INTO work_center (work_cente_number, work_cente_name, [condition], remark) VALUES (:work_cente_number, :work_cente_name, :condition, :remark)`, {
      replacements: { work_cente_number: b.work_cente_number, work_cente_name: b.work_cente_name || '', condition: b.condition || '', remark: b.remark || '' }
    });
    res.json(success(null, '创建工作中心成功'));
  } catch (err) { next(err); }
};

export const updateWorkCenter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    await sequelize.query(`UPDATE work_center SET work_cente_name = :work_cente_name, [condition] = :condition, remark = :remark WHERE work_cente_number = :id`, { replacements: { id, work_cente_name: b.work_cente_name, condition: b.condition || '', remark: b.remark } });
    res.json(success(null, '更新工作中心成功'));
  } catch (err) { next(err); }
};

export const deleteWorkCenter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM work_center WHERE work_cente_number = :id`, { replacements: { id } });
    res.json(success(null, '删除工作中心成功'));
  } catch (err) { next(err); }
};

export const exportWorkCenters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM work_center ORDER BY work_cente_number`);
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, fields, headers, 'work_centers', res, format);
  } catch (err) { next(err); }
};

export const importWorkCenters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let successCount = 0;
    for (const item of rows) {
      try {
        await sequelize.query(`INSERT INTO work_center (work_cente_number, work_cente_name, [condition], remark) VALUES (:work_cente_number, :work_cente_name, :condition, :remark)`, {
          replacements: { work_cente_number: item.work_cente_number || '', work_cente_name: item.work_cente_name || '', condition: item.condition || '', remark: item.remark || '' }
        });
        successCount++;
      } catch (e) {}
    }
    res.json(success({ successCount, totalCount: rows.length }, `成功导入 ${successCount} 条记录`));
  } catch (err) { next(err); }
};

export const approveWorkCenter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE work_center SET approval_status = N'已审核' WHERE work_cente_number = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawWorkCenter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE work_center SET approval_status = N'未审核' WHERE work_cente_number = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};
