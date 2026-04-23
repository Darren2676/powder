import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';

const fields = ['workshop_number', 'workshop_name', 'remark'];
const headers = ['车间编号', '车间名称', '备注'];

export const getWorkshops = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE workshop_number LIKE :search OR workshop_name LIKE :search`; replacements.search = `%${search}%`; }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM workshop ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY workshop_number) AS _row_num FROM workshop ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取车间列表成功'));
  } catch (err) { next(err); }
};

export const createWorkshop = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.workshop_number) { res.status(400).json({ success: false, message: '车间编号不能为空' }); return; }
    await sequelize.query(`INSERT INTO workshop (workshop_number, workshop_name, remark) VALUES (:workshop_number, :workshop_name, :remark)`, {
      replacements: { workshop_number: b.workshop_number, workshop_name: b.workshop_name || '', remark: b.remark || '' }
    });
    res.json(success(null, '创建车间成功'));
  } catch (err) { next(err); }
};

export const updateWorkshop = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM workshop WHERE workshop_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' }); return; }
    const b = req.body;
    await sequelize.query(`UPDATE workshop SET workshop_name = :workshop_name, remark = :remark WHERE workshop_number = :id`, { replacements: { id, workshop_name: b.workshop_name, remark: b.remark } });
    res.json(success(null, '更新车间成功'));
  } catch (err) { next(err); }
};

export const deleteWorkshop = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM workshop WHERE workshop_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' }); return; }
    await sequelize.query(`DELETE FROM workshop WHERE workshop_number = :id`, { replacements: { id } });
    res.json(success(null, '删除车间成功'));
  } catch (err) { next(err); }
};

export const exportWorkshops = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM workshop ORDER BY workshop_number`);
    exportToExcel(items, fields, headers, 'workshops', res);
  } catch (err) { next(err); }
};

export const importWorkshops = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let successCount = 0;
    for (const item of rows) {
      try {
        await sequelize.query(`INSERT INTO workshop (workshop_number, workshop_name, remark) VALUES (:workshop_number, :workshop_name, :remark)`, {
          replacements: { workshop_number: item.workshop_number || '', workshop_name: item.workshop_name || '', remark: item.remark || '' }
        });
        successCount++;
      } catch (e) {}
    }
    res.json(success({ successCount, totalCount: rows.length }, `成功导入 ${successCount} 条记录`));
  } catch (err) { next(err); }
};

export const approveWorkshop = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE workshop SET approval_status = N'已审核' WHERE workshop_number = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawWorkshop = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE workshop SET approval_status = N'未审核' WHERE workshop_number = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};

export const toggleWorkshopStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE workshop SET status = CASE WHEN ISNULL(status, N'启用') = N'启用' THEN N'禁用' ELSE N'启用' END WHERE workshop_number = :id`, { replacements: { id } });
    res.json(success(null, '状态更新成功'));
  } catch (err) { next(err); }
};
