import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

function buildWhere(req: Request, dateField: string, extraClause = '') {
  const { start_date, end_date, search } = req.query;
  let where = `WHERE si.stock_in_type = N'报废入库'${extraClause}`;
  const reps: any = {};
  const _factoryId = getFactoryId(req);
  if (_factoryId !== null) { where += ` AND si.factory_id = :_factoryId`; reps._factoryId = _factoryId; }
  if (start_date) { where += ` AND si.${dateField} >= :start_date`; reps.start_date = start_date; }
  if (end_date) { where += ` AND si.${dateField} <= :end_date`; reps.end_date = end_date; }
  if (search) { where += ` AND (si.stock_in_number LIKE :search OR si.warehouse_name LIKE :search)`; reps.search = `%${search}%`; }
  return { where, reps };
}

export const getScrapOrderKPI = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { where, reps } = buildWhere(req, 'stock_in_date');
    const [rows]: any = await sequelize.query(`
      SELECT
        COUNT(*) AS total,
        ISNULL(SUM(sid.stock_in_quantity), 0) AS total_scrap_qty,
        SUM(CASE WHEN si.approval_status = N'草稿' THEN 1 ELSE 0 END) AS draft_count,
        SUM(CASE WHEN si.approval_status = N'已审批' THEN 1 ELSE 0 END) AS approved_count
      FROM stock_in si
      LEFT JOIN stock_in_detail sid ON si.stock_in_number = sid.stock_in_number
      ${where}
    `, { replacements: reps });
    res.json(success(rows[0] || {}));
  } catch (err) { next(err); }
};

export const getScrapOrderChartData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { where, reps } = buildWhere(req, 'stock_in_date');

    const [statusDist]: any = await sequelize.query(`
      SELECT si.approval_status AS name, COUNT(*) AS value
      FROM stock_in si ${where}
      GROUP BY si.approval_status
    `, { replacements: reps });

    const [sourceDist]: any = await sequelize.query(`
      SELECT ISNULL(np.source_type, N'未知') AS name, COUNT(*) AS value
      FROM stock_in si
      LEFT JOIN nonconforming_product np ON si.stock_in_number = np.stock_in_number
      ${where}
      GROUP BY np.source_type
    `, { replacements: reps });

    const [monthlyTrend]: any = await sequelize.query(`
      SELECT CONVERT(NVARCHAR(7), si.creation_date, 120) AS month,
             COUNT(*) AS order_count,
             ISNULL(SUM(sid.stock_in_quantity), 0) AS total_qty
      FROM stock_in si
      LEFT JOIN stock_in_detail sid ON si.stock_in_number = sid.stock_in_number
      ${where}
      GROUP BY CONVERT(NVARCHAR(7), si.creation_date, 120)
      ORDER BY month
    `, { replacements: reps });

    res.json(success({ status_distribution: statusDist, source_distribution: sourceDist, monthly_trend: monthlyTrend }));
  } catch (err) { next(err); }
};

export const getScrapOrderTableData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const offsetEnd = offset + limit;
    const { where, reps } = buildWhere(req, 'stock_in_date');
    Object.assign(reps, { offset, offsetEnd });

    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) AS total FROM stock_in si ${where}
    `, { replacements: reps });

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT si.stock_in_number, si.warehouse_number, si.warehouse_name,
               si.stock_in_date, si.approval_status, si.operator,
               si.remark, si.creation_date,
               COUNT(sid.line_number) AS item_count,
               ISNULL(SUM(sid.stock_in_quantity), 0) AS total_qty,
               ROW_NUMBER() OVER (ORDER BY si.creation_date DESC) AS _row_num
        FROM stock_in si
        LEFT JOIN stock_in_detail sid ON si.stock_in_number = sid.stock_in_number
        ${where}
        GROUP BY si.stock_in_number, si.warehouse_number, si.warehouse_name,
                 si.stock_in_date, si.approval_status, si.operator,
                 si.remark, si.creation_date
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: reps });

    res.json(success({ items, total: countResult[0]?.total || 0, page, limit }));
  } catch (err) { next(err); }
};
