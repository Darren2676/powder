import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

const fields = ['employee_number', 'employee_name', 'gender', 'age', 'date_on_board'];
const headers = ['员工编号', '员工姓名', '性别', '年龄', '入职日期'];

export const getEmployees = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE employee_number LIKE :search OR employee_name LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM employee ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY employee_number) AS _row_num FROM employee ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取员工列表成功'));
  } catch (err) { next(err); }
};

export const createEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { employee_number, employee_name, gender, age, date_on_board } = req.body;
    if (!employee_number) { res.status(400).json({ success: false, message: '员工编号不能为空' }); return; }
    await sequelize.query(`INSERT INTO employee (employee_number, employee_name, gender, age, date_on_board) VALUES (:employee_number, :employee_name, :gender, :age, :date_on_board)`, {
      replacements: { employee_number, employee_name: employee_name || '', gender: gender || '', age: age || '', date_on_board: date_on_board || null }
    });
    res.json(success(null, '创建员工成功'));
  } catch (err) { next(err); }
};

export const updateEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { employee_name, gender, age, date_on_board } = req.body;
    await sequelize.query(`UPDATE employee SET employee_name = :employee_name, gender = :gender, age = :age, date_on_board = :date_on_board WHERE employee_number = :id`, {
      replacements: { id, employee_name, gender, age, date_on_board }
    });
    res.json(success(null, '更新员工成功'));
  } catch (err) { next(err); }
};

export const deleteEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM employee WHERE employee_number = :id`, { replacements: { id } });
    res.json(success(null, '删除员工成功'));
  } catch (err) { next(err); }
};

export const exportEmployees = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM employee ORDER BY employee_number`);
    exportToExcel(items, fields, headers, 'employees', res);
  } catch (err) { next(err); }
};

export const importEmployees = async (req: Request, res: Response, next: NextFunction) => {
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
        await sequelize.query(`INSERT INTO employee (employee_number, employee_name, gender, age, date_on_board) VALUES (:employee_number, :employee_name, :gender, :age, :date_on_board)`, {
          replacements: {
            employee_number: item.employee_number || '',
            employee_name: item.employee_name || '',
            gender: item.gender || '',
            age: item.age || '',
            date_on_board: item.date_on_board || null
          }
        });
        imported++;
      } catch (e) {}
    }

    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};
