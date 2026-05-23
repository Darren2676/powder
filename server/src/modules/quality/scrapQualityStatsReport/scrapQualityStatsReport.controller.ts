import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

function buildWhere(req: Request, dateField = 'handling_date') {
  const { start_date, end_date, search } = req.query;
  let where = 'WHERE 1=1';
  const reps: any = {};
  if (start_date) { where += ` AND np.${dateField} >= :start_date`; reps.start_date = start_date; }
  if (end_date) { where += ` AND np.${dateField} <= :end_date`; reps.end_date = end_date; }
  if (search) {
    where += ` AND (np.nonconforming_number LIKE :search OR np.item_number LIKE :search OR np.item_name LIKE :search)`;
    reps.search = `%${search}%`;
  }
  return { where, reps };
}

export const getScrapQualityStatsKPI = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { where, reps } = buildWhere(req);
    const [rows]: any = await sequelize.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN np.handling_status = N'已完成' THEN 1 ELSE 0 END) AS processed_count,
        SUM(CASE WHEN np.handling_method = N'报废' THEN 1 ELSE 0 END) AS scrap_count,
        SUM(CASE WHEN np.handling_status = N'待处理' THEN 1 ELSE 0 END) AS pending_count
      FROM nonconforming_product np
      ${where}
    `, { replacements: reps });
    res.json(success(rows[0] || {}));
  } catch (err) { next(err); }
};

export const getScrapQualityStatsChartData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { where, reps } = buildWhere(req);

    const [methodDist]: any = await sequelize.query(`
      SELECT ISNULL(np.handling_method, N'未处理') AS name, COUNT(*) AS value
      FROM nonconforming_product np
      ${where}
      GROUP BY np.handling_method
      ORDER BY value DESC
    `, { replacements: reps });

    const [sourceDist]: any = await sequelize.query(`
      SELECT ISNULL(np.source_type, N'未知') AS name, COUNT(*) AS value
      FROM nonconforming_product np
      ${where}
      GROUP BY np.source_type
      ORDER BY value DESC
    `, { replacements: reps });

    const [monthlyTrend]: any = await sequelize.query(`
      SELECT CONVERT(NVARCHAR(7), np.handling_date, 120) AS month,
             COUNT(*) AS order_count,
             ISNULL(SUM(np.scrap_quantity), 0) AS total_qty
      FROM nonconforming_product np
      ${where} AND np.handling_method = N'报废'
      GROUP BY CONVERT(NVARCHAR(7), np.handling_date, 120)
      ORDER BY month
    `, { replacements: reps });

    const [topItems]: any = await sequelize.query(`
      SELECT TOP 10 np.item_number, np.item_name,
             ISNULL(SUM(np.scrap_quantity), 0) AS total_scrap
      FROM nonconforming_product np
      ${where} AND np.handling_method = N'报废'
      GROUP BY np.item_number, np.item_name
      ORDER BY total_scrap DESC
    `, { replacements: reps });

    res.json(success({
      method_distribution: methodDist,
      source_distribution: sourceDist,
      monthly_trend: monthlyTrend,
      top_items: topItems
    }));
  } catch (err) { next(err); }
};

export const getScrapQualityStatsTableData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const offsetEnd = offset + limit;
    const { where, reps } = buildWhere(req);
    Object.assign(reps, { offset, offsetEnd });

    const scrapWhere = where + ` AND np.handling_method = N'报废'`;

    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) AS total FROM nonconforming_product np ${scrapWhere}
    `, { replacements: reps });

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT np.nonconforming_number, np.source_type, np.source_number,
               np.item_number, np.item_name, np.specifications, np.basic_unit,
               np.unqualified_quantity, np.scrap_quantity,
               np.handling_method, np.handling_status, np.handling_date,
               np.stock_in_number, np.remark,
               ROW_NUMBER() OVER (ORDER BY np.handling_date DESC, np.nonconforming_number DESC) AS _row_num
        FROM nonconforming_product np
        ${scrapWhere}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: reps });

    res.json(success({ items, total: countResult[0]?.total || 0, page, limit }));
  } catch (err) { next(err); }
};
