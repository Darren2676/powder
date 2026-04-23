import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

// ==================== 查询列表 ====================
export const getAccountingPeriods = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fiscalYear = req.query.fiscal_year as string || '';
    const status = req.query.status as string || '';

    let sql = `SELECT * FROM accounting_period WHERE 1=1`;
    const replacements: any = {};

    if (fiscalYear) {
      sql += ` AND fiscal_year = :fiscalYear`;
      replacements.fiscalYear = parseInt(fiscalYear);
    }
    if (status) {
      sql += ` AND status = :status`;
      replacements.status = status;
    }
    sql += ` ORDER BY fiscal_year DESC, period_number ASC`;

    const [rows]: any = await sequelize.query(sql, { replacements });
    res.json(success(rows, '获取会计期间列表成功'));
  } catch (err) { next(err); }
};

// ==================== 批量生成年度期间 ====================
export const generatePeriods = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.fiscal_year) {
      res.status(400).json({ success: false, message: '请指定会计年度' });
      return;
    }

    const year = parseInt(b.fiscal_year);
    const type = b.period_type || 'monthly'; // monthly | quarterly

    // 检查该年度是否已存在
    const [existing]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM accounting_period WHERE fiscal_year = :year`,
      { replacements: { year } }
    );
    if (existing[0].cnt > 0) {
      res.status(400).json({ success: false, message: `${year}年度的会计期间已存在` });
      return;
    }

    const username = (req as any).user?.username || '';
    const transaction = await sequelize.transaction();
    try {
      if (type === 'quarterly') {
        // 季度：4个期间
        const quarters = [
          { num: 1, name: `${year}年第1季度`, start: `${year}-01-01`, end: `${year}-03-31` },
          { num: 2, name: `${year}年第2季度`, start: `${year}-04-01`, end: `${year}-06-30` },
          { num: 3, name: `${year}年第3季度`, start: `${year}-07-01`, end: `${year}-09-30` },
          { num: 4, name: `${year}年第4季度`, start: `${year}-10-01`, end: `${year}-12-31` }
        ];
        for (const q of quarters) {
          await sequelize.query(`
            INSERT INTO accounting_period (period_code, period_name, fiscal_year, period_number, start_date, end_date, creation_man)
            VALUES (:code, :name, :year, :num, :start, :end, :man)
          `, {
            replacements: {
              code: `${year}-Q${q.num}`,
              name: q.name,
              year, num: q.num,
              start: q.start, end: q.end,
              man: username
            },
            transaction
          });
        }
      } else {
        // 月度：12个期间
        for (let m = 1; m <= 12; m++) {
          const mm = m.toString().padStart(2, '0');
          // 计算月末日期
          const lastDay = new Date(year, m, 0).getDate();
          await sequelize.query(`
            INSERT INTO accounting_period (period_code, period_name, fiscal_year, period_number, start_date, end_date, creation_man)
            VALUES (:code, :name, :year, :num, :start, :end, :man)
          `, {
            replacements: {
              code: `${year}-${mm}`,
              name: `${year}年${m}月`,
              year, num: m,
              start: `${year}-${mm}-01`,
              end: `${year}-${mm}-${lastDay}`,
              man: username
            },
            transaction
          });
        }
      }
      await transaction.commit();
      res.json(success(null, `${year}年度会计期间生成成功`));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 开启期间 ====================
export const openPeriod = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(
      `SELECT * FROM accounting_period WHERE id = :id`,
      { replacements: { id } }
    );
    if (rows.length === 0) {
      res.status(404).json({ success: false, message: '期间不存在' });
      return;
    }
    if (rows[0].status === '已开启') {
      res.status(400).json({ success: false, message: '该期间已处于开启状态' });
      return;
    }
    if (rows[0].status === '已关闭') {
      res.status(400).json({ success: false, message: '已关闭的期间不能重新开启' });
      return;
    }

    await sequelize.query(
      `UPDATE accounting_period SET status = N'已开启' WHERE id = :id`,
      { replacements: { id } }
    );
    res.json(success(null, '开启期间成功'));
  } catch (err) { next(err); }
};

// ==================== 关闭期间 ====================
export const closePeriod = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const username = (req as any).user?.username || '';

    const [rows]: any = await sequelize.query(
      `SELECT * FROM accounting_period WHERE id = :id`,
      { replacements: { id } }
    );
    if (rows.length === 0) {
      res.status(404).json({ success: false, message: '期间不存在' });
      return;
    }
    if (rows[0].status === '已关闭') {
      res.status(400).json({ success: false, message: '该期间已处于关闭状态' });
      return;
    }
    if (rows[0].status === '未开启') {
      res.status(400).json({ success: false, message: '未开启的期间不能关闭，请先开启' });
      return;
    }

    await sequelize.query(
      `UPDATE accounting_period SET status = N'已关闭', closed_by = :closedBy, closed_date = GETDATE() WHERE id = :id`,
      { replacements: { id, closedBy: username } }
    );
    res.json(success(null, '关闭期间成功'));
  } catch (err) { next(err); }
};

// ==================== 更新期间备注 ====================
export const updatePeriod = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [rows]: any = await sequelize.query(
      `SELECT id FROM accounting_period WHERE id = :id`,
      { replacements: { id } }
    );
    if (rows.length === 0) {
      res.status(404).json({ success: false, message: '期间不存在' });
      return;
    }

    await sequelize.query(
      `UPDATE accounting_period SET remark = :remark WHERE id = :id`,
      { replacements: { id, remark: b.remark || '' } }
    );
    res.json(success(null, '更新成功'));
  } catch (err) { next(err); }
};

// ==================== 修改期间日期 ====================
export const updatePeriodDates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    if (!b.start_date || !b.end_date) {
      res.status(400).json({ success: false, message: '开始日期和结束日期不能为空' });
      return;
    }

    // 校验日期格式和逻辑
    const startD = new Date(b.start_date);
    const endD = new Date(b.end_date);
    if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
      res.status(400).json({ success: false, message: '日期格式不正确' });
      return;
    }
    if (startD >= endD) {
      res.status(400).json({ success: false, message: '开始日期必须早于结束日期' });
      return;
    }

    const [rows]: any = await sequelize.query(
      `SELECT * FROM accounting_period WHERE id = :id`,
      { replacements: { id } }
    );
    if (rows.length === 0) {
      res.status(404).json({ success: false, message: '期间不存在' });
      return;
    }
    if (rows[0].status === '已关闭') {
      res.status(400).json({ success: false, message: '已关闭的期间不允许修改日期' });
      return;
    }

    await sequelize.query(
      `UPDATE accounting_period SET start_date = :start_date, end_date = :end_date WHERE id = :id`,
      { replacements: { id, start_date: b.start_date, end_date: b.end_date } }
    );
    res.json(success(null, '期间日期修改成功'));
  } catch (err) { next(err); }
};

// ==================== 删除年度期间 ====================
export const deletePeriods = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fiscalYearParam = req.params.fiscal_year as string;
    const year = parseInt(fiscalYearParam);

    // 检查是否有已开启或已关闭的期间
    const [opened]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM accounting_period WHERE fiscal_year = :year AND status != N'未开启'`,
      { replacements: { year } }
    );
    if (opened[0].cnt > 0) {
      res.status(400).json({ success: false, message: '该年度存在已开启或已关闭的期间，无法删除' });
      return;
    }

    await sequelize.query(
      `DELETE FROM accounting_period WHERE fiscal_year = :year`,
      { replacements: { year } }
    );
    res.json(success(null, `${year}年度会计期间已删除`));
  } catch (err) { next(err); }
};

// ==================== 获取可用年度列表 ====================
export const getAvailableYears = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows]: any = await sequelize.query(
      `SELECT DISTINCT fiscal_year FROM accounting_period ORDER BY fiscal_year DESC`
    );
    const years = rows.map((r: any) => r.fiscal_year);
    res.json(success(years, '获取年度列表成功'));
  } catch (err) { next(err); }
};
