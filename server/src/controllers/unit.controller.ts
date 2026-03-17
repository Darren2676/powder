import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

const fields = ['unit_code', 'unit_name', 'remark'];
const headers = ['单位编码', '单位名称', '备注'];

export const getUnits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE unit_code LIKE :search OR unit_name LIKE :search`; replacements.search = `%${search}%`; }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM unit ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY unit_code) AS _row_num FROM unit ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取单位列表成功'));
  } catch (err) { next(err); }
};

export const createUnit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { unit_code, unit_name, remark } = req.body;
    if (!unit_code) { res.status(400).json({ success: false, message: '单位编码不能为空' }); return; }
    await sequelize.query(`INSERT INTO unit (unit_code, unit_name, remark) VALUES (:unit_code, :unit_name, :remark)`, {
      replacements: { unit_code, unit_name: unit_name || '', remark: remark || '' }
    });
    res.json(success(null, '创建单位成功'));
  } catch (err) { next(err); }
};

export const updateUnit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { unit_name, remark } = req.body;
    await sequelize.query(`UPDATE unit SET unit_name = :unit_name, remark = :remark WHERE unit_code = :id`, { replacements: { id, unit_name, remark } });
    res.json(success(null, '更新单位成功'));
  } catch (err) { next(err); }
};

export const deleteUnit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM unit WHERE unit_code = :id`, { replacements: { id } });
    res.json(success(null, '删除单位成功'));
  } catch (err) { next(err); }
};

export const exportUnits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM unit ORDER BY unit_code`);
    exportToExcel(items, fields, headers, 'units', res);
  } catch (err) { next(err); }
};

export const importUnits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let imported = 0;
    for (const item of rows) {
      try {
        await sequelize.query(`INSERT INTO unit (unit_code, unit_name, remark) VALUES (:unit_code, :unit_name, :remark)`, {
          replacements: { unit_code: item.unit_code || '', unit_name: item.unit_name || '', remark: item.remark || '' }
        });
        imported++;
      } catch {}
    }
    res.json(success({ total: rows.length, imported }, '导入完成'));
  } catch (err) { next(err); }
};
