import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';

const fields = ['schedules_id', 'schedules_name', 'remark'];
const headers = ['班次ID', '班次名称', '备注'];

export const getSchedules = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE schedules_id LIKE :search OR schedules_name LIKE :search`; replacements.search = `%${search}%`; }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM schedules ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY schedules_id) AS _row_num FROM schedules ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取班次列表成功'));
  } catch (err) { next(err); }
};

export const createSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.schedules_id) { res.status(400).json({ success: false, message: '班次ID不能为空' }); return; }
    await sequelize.query(`INSERT INTO schedules (schedules_id, schedules_name, remark) VALUES (:schedules_id, :schedules_name, :remark)`, {
      replacements: { schedules_id: b.schedules_id, schedules_name: b.schedules_name || '', remark: b.remark || '' }
    });
    res.json(success(null, '创建班次成功'));
  } catch (err) { next(err); }
};

export const updateSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM schedules WHERE schedules_id = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' }); return; }
    const b = req.body;
    await sequelize.query(`UPDATE schedules SET schedules_name = :schedules_name, remark = :remark WHERE schedules_id = :id`, { replacements: { id, schedules_name: b.schedules_name, remark: b.remark } });
    res.json(success(null, '更新班次成功'));
  } catch (err) { next(err); }
};

export const deleteSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM schedules WHERE schedules_id = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' }); return; }
    await sequelize.query(`DELETE FROM schedules WHERE schedules_id = :id`, { replacements: { id } });
    res.json(success(null, '删除班次成功'));
  } catch (err) { next(err); }
};

export const exportSchedules = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM schedules ORDER BY schedules_id`);
    exportToExcel(items, fields, headers, 'schedules', res);
  } catch (err) { next(err); }
};

export const importSchedules = async (req: Request, res: Response, next: NextFunction) => {
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

    let imported = 0;
    for (const item of rows) {
      try {
        await sequelize.query(`INSERT INTO schedules (schedules_id, schedules_name, remark) VALUES (:schedules_id, :schedules_name, :remark)`, {
          replacements: {
            schedules_id: item.schedules_id || '',
            schedules_name: item.schedules_name || '',
            remark: item.remark || ''
          }
        });
        imported++;
      } catch (e) {}
    }

    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};

export const approveSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE schedules SET approval_status = N'已审核' WHERE schedules_id = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE schedules SET approval_status = N'未审核' WHERE schedules_id = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};

export const toggleScheduleStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE schedules SET status = CASE WHEN ISNULL(status, N'启用') = N'启用' THEN N'禁用' ELSE N'启用' END WHERE schedules_id = :id`, { replacements: { id } });
    res.json(success(null, '状态更新成功'));
  } catch (err) { next(err); }
};
