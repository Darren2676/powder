import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

function buildWhere(req: Request) {
  const { start_date, end_date, search } = req.query;
  let where = 'WHERE 1=1';
  const reps: any = {};
  if (start_date) { where += ` AND sd.creation_date >= :start_date`; reps.start_date = start_date; }
  if (end_date) { where += ` AND sd.creation_date <= :end_date`; reps.end_date = end_date; }
  if (search) { where += ` AND (sd.disposal_number LIKE :search OR sd.disposal_reason LIKE :search)`; reps.search = `%${search}%`; }
  return { where, reps };
}

export const getScrapDisposalKPI = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { where, reps } = buildWhere(req);
    const [rows]: any = await sequelize.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN sd.status = N'待确认' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN sd.status = N'已确认' THEN 1 ELSE 0 END) AS confirmed_count,
        SUM(CASE WHEN sd.status = N'已驳回' THEN 1 ELSE 0 END) AS rejected_count
      FROM scrap_disposal sd
      ${where}
    `, { replacements: reps });

    const [qtyResult]: any = await sequelize.query(`
      SELECT ISNULL(SUM(sdd.quantity), 0) AS total_qty
      FROM scrap_disposal sd
      INNER JOIN scrap_disposal_detail sdd ON sd.disposal_number = sdd.disposal_number
      ${where}
    `, { replacements: reps });

    res.json(success({ ...rows[0], total_qty: qtyResult[0]?.total_qty || 0 }));
  } catch (err) { next(err); }
};

export const getScrapDisposalChartData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { where, reps } = buildWhere(req);

    const [statusDist]: any = await sequelize.query(`
      SELECT sd.status AS name, COUNT(*) AS value
      FROM scrap_disposal sd ${where}
      GROUP BY sd.status
    `, { replacements: reps });

    const [reasonDist]: any = await sequelize.query(`
      SELECT ISNULL(sd.disposal_reason, N'未填写') AS name, COUNT(*) AS value
      FROM scrap_disposal sd ${where}
      GROUP BY sd.disposal_reason
      ORDER BY value DESC
    `, { replacements: reps });

    const [monthlyTrend]: any = await sequelize.query(`
      SELECT CONVERT(NVARCHAR(7), sd.creation_date, 120) AS month,
             COUNT(*) AS order_count,
             ISNULL((SELECT SUM(sdd.quantity) FROM scrap_disposal_detail sdd
                     WHERE sdd.disposal_number IN (
                       SELECT sd2.disposal_number FROM scrap_disposal sd2
                       WHERE CONVERT(NVARCHAR(7), sd2.creation_date, 120) = CONVERT(NVARCHAR(7), sd.creation_date, 120)
                     )), 0) AS total_qty
      FROM scrap_disposal sd ${where}
      GROUP BY CONVERT(NVARCHAR(7), sd.creation_date, 120)
      ORDER BY month
    `, { replacements: reps });

    res.json(success({ status_distribution: statusDist, reason_distribution: reasonDist, monthly_trend: monthlyTrend }));
  } catch (err) { next(err); }
};

export const getScrapDisposalTableData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const offsetEnd = offset + limit;
    const { where, reps } = buildWhere(req);
    Object.assign(reps, { offset, offsetEnd });

    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) AS total FROM scrap_disposal sd ${where}
    `, { replacements: reps });

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT sd.disposal_number, sd.status, sd.disposal_reason,
               sd.warehouse_number, sd.warehouse_name,
               sd.operator, sd.creation_date,
               sd.confirmed_by, sd.confirmed_date, sd.confirm_remark,
               sd.remark,
               (SELECT ISNULL(SUM(sdd.quantity), 0) FROM scrap_disposal_detail sdd
                WHERE sdd.disposal_number = sd.disposal_number) AS total_qty,
               ROW_NUMBER() OVER (ORDER BY sd.creation_date DESC) AS _row_num
        FROM scrap_disposal sd
        ${where}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: reps });

    res.json(success({ items, total: countResult[0]?.total || 0, page, limit }));
  } catch (err) { next(err); }
};
