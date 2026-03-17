import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

const fields = ['productionline_number', 'productionline_name', 'remark'];
const headers = ['产线编号', '产线名称', '备注'];

export const getProductionlines = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE productionline_number LIKE :search OR productionline_name LIKE :search`; replacements.search = `%${search}%`; }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM productionline ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY productionline_number) AS _row_num FROM productionline ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取产线列表成功'));
  } catch (err) { next(err); }
};

export const createProductionline = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productionline_number, productionline_name, remark } = req.body;
    if (!productionline_number) { res.status(400).json({ success: false, message: '产线编号不能为空' }); return; }
    await sequelize.query(`INSERT INTO productionline (productionline_number, productionline_name, remark) VALUES (:productionline_number, :productionline_name, :remark)`, {
      replacements: { productionline_number, productionline_name: productionline_name || '', remark: remark || '' }
    });
    res.json(success(null, '创建产线成功'));
  } catch (err) { next(err); }
};

export const updateProductionline = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { productionline_name, remark } = req.body;
    await sequelize.query(`UPDATE productionline SET productionline_name = :productionline_name, remark = :remark WHERE productionline_number = :id`, { replacements: { id, productionline_name, remark } });
    res.json(success(null, '更新产线成功'));
  } catch (err) { next(err); }
};

export const deleteProductionline = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM productionline WHERE productionline_number = :id`, { replacements: { id } });
    res.json(success(null, '删除产线成功'));
  } catch (err) { next(err); }
};

export const exportProductionlines = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM productionline ORDER BY productionline_number`);
    exportToExcel(items, fields, headers, 'productionlines', res);
  } catch (err) { next(err); }
};

export const importProductionlines = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let successCount = 0;
    for (const item of rows) {
      try {
        await sequelize.query(`INSERT INTO productionline (productionline_number, productionline_name, remark) VALUES (:productionline_number, :productionline_name, :remark)`, {
          replacements: { productionline_number: item.productionline_number || '', productionline_name: item.productionline_name || '', remark: item.remark || '' }
        });
        successCount++;
      } catch (e) {}
    }
    res.json(success({ successCount, totalCount: rows.length }, `成功导入 ${successCount} 条记录`));
  } catch (err) { next(err); }
};
