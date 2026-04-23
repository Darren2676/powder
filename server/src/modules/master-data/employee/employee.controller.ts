import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS, EMPLOYEE_STATUS } from '@/shared/constants/statuses';

const fields = ['employee_number', 'employee_name', 'gender', 'age', 'date_on_board', 'status'];
const headers = ['员工编号', '员工姓名', '性别', '年龄', '入职日期', '状态'];

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
    const b = req.body;
    if (!b.employee_number) { res.status(400).json({ success: false, message: '员工编号不能为空' }); return; }
    await sequelize.query(`INSERT INTO employee (employee_number, employee_name, gender, age, date_on_board, department, status) VALUES (:employee_number, :employee_name, :gender, :age, :date_on_board, :department, :status)`, {
      replacements: { employee_number: b.employee_number, employee_name: b.employee_name || '', gender: b.gender || '', age: b.age || '', date_on_board: b.date_on_board || null, department: b.department || '', status: EMPLOYEE_STATUS.INACTIVE }
    });
    res.json(success(null, '创建员工成功'));
  } catch (err) { next(err); }
};

export const updateEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM employee WHERE employee_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
      res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' });
      return;
    }
    const b = req.body;
    await sequelize.query(`UPDATE employee SET employee_name = :employee_name, gender = :gender, age = :age, date_on_board = :date_on_board, department = :department WHERE employee_number = :id`, {
      replacements: { id, employee_name: b.employee_name, gender: b.gender, age: b.age, date_on_board: b.date_on_board, department: b.department || '' }
    });
    res.json(success(null, '更新员工成功'));
  } catch (err) { next(err); }
};

export const deleteEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status, status FROM employee WHERE employee_number = :id`, { replacements: { id } });
    if (chk.length) {
      const approvalStatus = (chk[0].approval_status || '').trim();
      const empStatus = (chk[0].status || '').trim();
      if (empStatus !== EMPLOYEE_STATUS.INACTIVE || approvalStatus !== APPROVAL_STATUS.UNAPPROVED) {
        res.status(403).json({ success: false, message: '只有状态为"未激活"且审核状态为"未审核"的记录才允许删除' });
        return;
      }
    }
    await sequelize.query(`DELETE FROM employee WHERE employee_number = :id`, { replacements: { id } });
    res.json(success(null, '删除员工成功'));
  } catch (err) { next(err); }
};

export const approveEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE employee SET approval_status = N'已审核' WHERE employee_number = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE employee SET approval_status = N'未审核' WHERE employee_number = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};

export const enableEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE employee SET status = :status WHERE employee_number = :id`, { replacements: { id, status: EMPLOYEE_STATUS.ENABLED } });
    res.json(success(null, '启用成功'));
  } catch (err) { next(err); }
};

export const disableEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE employee SET status = :status WHERE employee_number = :id`, { replacements: { id, status: EMPLOYEE_STATUS.DISABLED } });
    res.json(success(null, '禁用成功'));
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
        await sequelize.query(`INSERT INTO employee (employee_number, employee_name, gender, age, date_on_board, department, status) VALUES (:employee_number, :employee_name, :gender, :age, :date_on_board, :department, :status)`, {
          replacements: {
            employee_number: item.employee_number || '',
            employee_name: item.employee_name || '',
            gender: item.gender || '',
            age: item.age || '',
            date_on_board: item.date_on_board || null,
            department: item.department || '',
            status: item.status || EMPLOYEE_STATUS.INACTIVE
          }
        });
        imported++;
      } catch (e) {}
    }

    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};
