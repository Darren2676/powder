import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

const fields = ['group_number', 'group_name', 'employee_number1', 'employee_name1', 'employee_number2', 'employee_name2', 'employee_number3', 'employee_name3', 'employee_number4', 'employee_name4', 'employee_number5', 'employee_name5'];
const headers = ['小组编号', '小组名称', '员工编号1', '员工姓名1', '员工编号2', '员工姓名2', '员工编号3', '员工姓名3', '员工编号4', '员工姓名4', '员工编号5', '员工姓名5'];

export const getGroups = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE group_number LIKE :search OR group_name LIKE :search`; replacements.search = `%${search}%`; }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM [group] ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY group_number) AS _row_num FROM [group] ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取小组列表成功'));
  } catch (err) { next(err); }
};

export const createGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.group_number) { res.status(400).json({ success: false, message: '小组编号不能为空' }); return; }
    await sequelize.query(`INSERT INTO [group] (group_number, group_name, employee_number1, employee_name1, employee_number2, employee_name2, employee_number3, employee_name3, employee_number4, employee_name4, employee_number5, employee_name5) VALUES (:group_number, :group_name, :employee_number1, :employee_name1, :employee_number2, :employee_name2, :employee_number3, :employee_name3, :employee_number4, :employee_name4, :employee_number5, :employee_name5)`, {
      replacements: { group_number: b.group_number, group_name: b.group_name || '', employee_number1: b.employee_number1 || '', employee_name1: b.employee_name1 || '', employee_number2: b.employee_number2 || '', employee_name2: b.employee_name2 || '', employee_number3: b.employee_number3 || '', employee_name3: b.employee_name3 || '', employee_number4: b.employee_number4 || '', employee_name4: b.employee_name4 || '', employee_number5: b.employee_number5 || '', employee_name5: b.employee_name5 || '' }
    });
    res.json(success(null, '创建小组成功'));
  } catch (err) { next(err); }
};

export const updateGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    await sequelize.query(`UPDATE [group] SET group_name = :group_name, employee_number1 = :employee_number1, employee_name1 = :employee_name1, employee_number2 = :employee_number2, employee_name2 = :employee_name2, employee_number3 = :employee_number3, employee_name3 = :employee_name3, employee_number4 = :employee_number4, employee_name4 = :employee_name4, employee_number5 = :employee_number5, employee_name5 = :employee_name5 WHERE group_number = :id`, {
      replacements: { id, group_name: b.group_name, employee_number1: b.employee_number1, employee_name1: b.employee_name1, employee_number2: b.employee_number2, employee_name2: b.employee_name2, employee_number3: b.employee_number3, employee_name3: b.employee_name3, employee_number4: b.employee_number4, employee_name4: b.employee_name4, employee_number5: b.employee_number5, employee_name5: b.employee_name5 }
    });
    res.json(success(null, '更新小组成功'));
  } catch (err) { next(err); }
};

export const deleteGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM [group] WHERE group_number = :id`, { replacements: { id } });
    res.json(success(null, '删除小组成功'));
  } catch (err) { next(err); }
};

export const exportGroups = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM [group] ORDER BY group_number`);
    exportToExcel(items, fields, headers, 'groups', res);
  } catch (err) { next(err); }
};

export const importGroups = async (req: Request, res: Response, next: NextFunction) => {
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
        await sequelize.query(`INSERT INTO [group] (group_number, group_name, employee_number1, employee_name1, employee_number2, employee_name2, employee_number3, employee_name3, employee_number4, employee_name4, employee_number5, employee_name5) VALUES (:group_number, :group_name, :employee_number1, :employee_name1, :employee_number2, :employee_name2, :employee_number3, :employee_name3, :employee_number4, :employee_name4, :employee_number5, :employee_name5)`, {
          replacements: {
            group_number: item.group_number || '',
            group_name: item.group_name || '',
            employee_number1: item.employee_number1 || '',
            employee_name1: item.employee_name1 || '',
            employee_number2: item.employee_number2 || '',
            employee_name2: item.employee_name2 || '',
            employee_number3: item.employee_number3 || '',
            employee_name3: item.employee_name3 || '',
            employee_number4: item.employee_number4 || '',
            employee_name4: item.employee_name4 || '',
            employee_number5: item.employee_number5 || '',
            employee_name5: item.employee_name5 || ''
          }
        });
        imported++;
      } catch (e) {}
    }

    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};
