import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';

const fields = ['team_number', 'team_name', 'employee_number1', 'employee_name1', 'employee_number2', 'employee_name2', 'employee_number3', 'employee_name3', 'employee_number4', 'employee_name4', 'employee_number5', 'employee_name5'];
const headers = ['班组编号', '班组名称', '员工编号1', '员工姓名1', '员工编号2', '员工姓名2', '员工编号3', '员工姓名3', '员工编号4', '员工姓名4', '员工编号5', '员工姓名5'];

export const getTeams = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE team_number LIKE :search OR team_name LIKE :search`; replacements.search = `%${search}%`; }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM [team] ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY team_number) AS _row_num FROM [team] ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取班组列表成功'));
  } catch (err) { next(err); }
};

export const createTeam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.team_number) { res.status(400).json({ success: false, message: '班组编号不能为空' }); return; }
    await sequelize.query(`INSERT INTO [team] (team_number, team_name, employee_number1, employee_name1, employee_number2, employee_name2, employee_number3, employee_name3, employee_number4, employee_name4, employee_number5, employee_name5) VALUES (:team_number, :team_name, :employee_number1, :employee_name1, :employee_number2, :employee_name2, :employee_number3, :employee_name3, :employee_number4, :employee_name4, :employee_number5, :employee_name5)`, {
      replacements: { team_number: b.team_number, team_name: b.team_name || '', employee_number1: b.employee_number1 || '', employee_name1: b.employee_name1 || '', employee_number2: b.employee_number2 || '', employee_name2: b.employee_name2 || '', employee_number3: b.employee_number3 || '', employee_name3: b.employee_name3 || '', employee_number4: b.employee_number4 || '', employee_name4: b.employee_name4 || '', employee_number5: b.employee_number5 || '', employee_name5: b.employee_name5 || '' }
    });
    res.json(success(null, '创建班组成功'));
  } catch (err) { next(err); }
};

export const updateTeam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM [team] WHERE team_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' }); return; }
    const b = req.body;
    await sequelize.query(`UPDATE [team] SET team_name = :team_name, employee_number1 = :employee_number1, employee_name1 = :employee_name1, employee_number2 = :employee_number2, employee_name2 = :employee_name2, employee_number3 = :employee_number3, employee_name3 = :employee_name3, employee_number4 = :employee_number4, employee_name4 = :employee_name4, employee_number5 = :employee_number5, employee_name5 = :employee_name5 WHERE team_number = :id`, {
      replacements: { id, team_name: b.team_name, employee_number1: b.employee_number1, employee_name1: b.employee_name1, employee_number2: b.employee_number2, employee_name2: b.employee_name2, employee_number3: b.employee_number3, employee_name3: b.employee_name3, employee_number4: b.employee_number4, employee_name4: b.employee_name4, employee_number5: b.employee_number5, employee_name5: b.employee_name5 }
    });
    res.json(success(null, '更新班组成功'));
  } catch (err) { next(err); }
};

export const deleteTeam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM [team] WHERE team_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' }); return; }
    await sequelize.query(`DELETE FROM [team] WHERE team_number = :id`, { replacements: { id } });
    res.json(success(null, '删除班组成功'));
  } catch (err) { next(err); }
};

export const exportTeams = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM [team] ORDER BY team_number`);
    exportToExcel(items, fields, headers, 'teams', res);
  } catch (err) { next(err); }
};

export const importTeams = async (req: Request, res: Response, next: NextFunction) => {
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
        await sequelize.query(`INSERT INTO [team] (team_number, team_name, employee_number1, employee_name1, employee_number2, employee_name2, employee_number3, employee_name3, employee_number4, employee_name4, employee_number5, employee_name5) VALUES (:team_number, :team_name, :employee_number1, :employee_name1, :employee_number2, :employee_name2, :employee_number3, :employee_name3, :employee_number4, :employee_name4, :employee_number5, :employee_name5)`, {
          replacements: {
            team_number: item.team_number || '',
            team_name: item.team_name || '',
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

export const approveTeam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE [team] SET approval_status = N'已审核' WHERE team_number = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawTeam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE [team] SET approval_status = N'未审核' WHERE team_number = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};

export const toggleTeamStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE [team] SET status = CASE WHEN ISNULL(status, N'启用') = N'启用' THEN N'禁用' ELSE N'启用' END WHERE team_number = :id`, { replacements: { id } });
    res.json(success(null, '状态更新成功'));
  } catch (err) { next(err); }
};
