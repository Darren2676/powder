import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

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
    const { schedules_id, schedules_name, remark } = req.body;
    if (!schedules_id) { res.status(400).json({ success: false, message: '班次ID不能为空' }); return; }
    await sequelize.query(`INSERT INTO schedules (schedules_id, schedules_name, remark) VALUES (:schedules_id, :schedules_name, :remark)`, {
      replacements: { schedules_id, schedules_name: schedules_name || '', remark: remark || '' }
    });
    res.json(success(null, '创建班次成功'));
  } catch (err) { next(err); }
};

export const updateSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { schedules_name, remark } = req.body;
    await sequelize.query(`UPDATE schedules SET schedules_name = :schedules_name, remark = :remark WHERE schedules_id = :id`, { replacements: { id, schedules_name, remark } });
    res.json(success(null, '更新班次成功'));
  } catch (err) { next(err); }
};

export const deleteSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
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
