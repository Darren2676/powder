import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

const fields = ['warehouse_number', 'warehouse_name', 'warehouse_type', 'condition', 'creation_date', 'creation_man'];
const headers = ['仓库编号', '仓库名称', '仓库类型', '状态', '创建日期', '创建人'];

export const getWarehouses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE warehouse_number LIKE :search OR warehouse_name LIKE :search`; replacements.search = `%${search}%`; }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM warehouse ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY warehouse_number) AS _row_num FROM warehouse ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取仓库列表成功'));
  } catch (err) { next(err); }
};

export const createWarehouse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.warehouse_number) { res.status(400).json({ success: false, message: '仓库编号不能为空' }); return; }
    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';
    await sequelize.query(`INSERT INTO warehouse (warehouse_number, warehouse_name, warehouse_type, [condition], creation_date, creation_man) VALUES (:warehouse_number, :warehouse_name, :warehouse_type, :condition, :creation_date, :creation_man)`, {
      replacements: {
        warehouse_number: b.warehouse_number,
        warehouse_name: b.warehouse_name || '',
        warehouse_type: b.warehouse_type || '',
        condition: b.condition || '',
        creation_date,
        creation_man
      }
    });
    res.json(success(null, '创建仓库成功'));
  } catch (err) { next(err); }
};

export const updateWarehouse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    await sequelize.query(`UPDATE warehouse SET warehouse_name = :warehouse_name, warehouse_type = :warehouse_type, [condition] = :condition WHERE warehouse_number = :id`, {
      replacements: {
        id,
        warehouse_name: b.warehouse_name || '',
        warehouse_type: b.warehouse_type || '',
        condition: b.condition || ''
      }
    });
    res.json(success(null, '更新仓库成功'));
  } catch (err) { next(err); }
};

export const deleteWarehouse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM warehouse WHERE warehouse_number = :id`, { replacements: { id } });
    res.json(success(null, '删除仓库成功'));
  } catch (err) { next(err); }
};

export const exportWarehouses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM warehouse ORDER BY warehouse_number`);
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, fields, headers, 'warehouses', res, format);
  } catch (err) { next(err); }
};

export const importWarehouses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let successCount = 0;
    for (const item of rows) {
      try {
        await sequelize.query(`INSERT INTO warehouse (warehouse_number, warehouse_name, warehouse_type, [condition], creation_date, creation_man) VALUES (:warehouse_number, :warehouse_name, :warehouse_type, :condition, :creation_date, :creation_man)`, {
          replacements: {
            warehouse_number: item.warehouse_number || '',
            warehouse_name: item.warehouse_name || '',
            warehouse_type: item.warehouse_type || '',
            condition: item.condition || '',
            creation_date: item.creation_date || null,
            creation_man: item.creation_man || ''
          }
        });
        successCount++;
      } catch (e) {}
    }
    res.json(success({ successCount, totalCount: rows.length }, `成功导入 ${successCount} 条记录`));
  } catch (err) { next(err); }
};
