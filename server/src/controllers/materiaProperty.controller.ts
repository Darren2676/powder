import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

const tableName = 'materia_property';
const pkField = 'materia_properties_number';
const nameField = 'materia_properties_name';
const label = '物料属性';
const fields = [pkField, nameField, 'remark'];
const headers = ['物料属性编号', '物料属性名称', '备注'];

export const getList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE ${pkField} LIKE :search OR ${nameField} LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM ${tableName} ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY ${pkField}) AS _row_num FROM ${tableName} ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, `获取${label}列表成功`));
  } catch (err) { next(err); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b[pkField]) { res.status(400).json({ success: false, message: `${label}编号不能为空` }); return; }
    await sequelize.query(
      `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${fields.map(f => ':' + f).join(', ')})`,
      { replacements: { [pkField]: b[pkField], [nameField]: b[nameField] || '', remark: b.remark || '' } }
    );
    res.json(success(null, `创建${label}成功`));
  } catch (err) { next(err); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    await sequelize.query(
      `UPDATE ${tableName} SET ${nameField} = :name, remark = :remark WHERE ${pkField} = :id`,
      { replacements: { id, name: b[nameField], remark: b.remark } }
    );
    res.json(success(null, `更新${label}成功`));
  } catch (err) { next(err); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM ${tableName} WHERE ${pkField} = :id`, { replacements: { id } });
    res.json(success(null, `删除${label}成功`));
  } catch (err) { next(err); }
};

export const exportData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT ${fields.join(', ')} FROM ${tableName} ORDER BY ${pkField}`);
    exportToExcel(items, fields, headers, 'materia_property', res);
  } catch (err) { next(err); }
};

export const importData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let imported = 0, skipped = 0;
    for (const r of rows) {
      if (!r[pkField]) { skipped++; continue; }
      const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM ${tableName} WHERE ${pkField} = :pk`, { replacements: { pk: r[pkField] } });
      if (existing[0].cnt > 0) {
        await sequelize.query(`UPDATE ${tableName} SET ${nameField} = :name, remark = :remark WHERE ${pkField} = :pk`, { replacements: { pk: r[pkField], name: r[nameField], remark: r.remark } });
      } else {
        await sequelize.query(`INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${fields.map(f => ':' + f).join(', ')})`, { replacements: r });
      }
      imported++;
    }
    res.json(success({ imported, skipped }, `导入完成，成功 ${imported} 条，跳过 ${skipped} 条`));
  } catch (err) { next(err); }
};

