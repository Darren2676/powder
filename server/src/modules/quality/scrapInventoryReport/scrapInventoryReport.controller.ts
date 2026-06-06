import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

const getScrapWarehouseNumber = async (): Promise<string | null> => {
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 warehouse_number FROM warehouse WHERE warehouse_type = N'报废仓库'`
  );
  return rows.length ? rows[0].warehouse_number : null;
};

export const getScrapInventoryKPI = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wn = await getScrapWarehouseNumber();
    if (!wn) { res.json(success({ item_types: 0, total_qty: 0, batch_count: 0, overdue_count: 0 })); return; }

    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps: any = _factoryId !== null ? { _factoryId } : {};
    const [rows]: any = await sequelize.query(`
      SELECT
        COUNT(DISTINCT item_number) AS item_types,
        ISNULL(SUM(quantity), 0) AS total_qty,
        COUNT(*) AS batch_count,
        SUM(CASE WHEN DATEDIFF(day, inbound_date, GETDATE()) > 30 THEN 1 ELSE 0 END) AS overdue_count
      FROM finished_batch_inventory
      WHERE warehouse_number = :wn AND status <> N'冻结'${factoryCond}
    `, { replacements: { wn, ...factoryReps } });
    res.json(success(rows[0] || {}));
  } catch (err) { next(err); }
};

export const getScrapInventoryChartData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wn = await getScrapWarehouseNumber();
    if (!wn) { res.json(success({ inventory_by_item: [], monthly_inbound: [], backlog_items: [] })); return; }

    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps: any = _factoryId !== null ? { _factoryId } : {};
    const baseWhere = `warehouse_number = :wn AND status <> N'冻结'${factoryCond}`;

    const [inventoryByItem]: any = await sequelize.query(`
      SELECT item_number, item_name, SUM(quantity) AS total_qty
      FROM finished_batch_inventory
      WHERE ${baseWhere}
      GROUP BY item_number, item_name
      ORDER BY total_qty DESC
    `, { replacements: { wn, ...factoryReps } });

    const [monthlyInbound]: any = await sequelize.query(`
      SELECT CONVERT(NVARCHAR(7), inbound_date, 120) AS month, SUM(quantity) AS qty
      FROM finished_batch_inventory
      WHERE ${baseWhere}
      GROUP BY CONVERT(NVARCHAR(7), inbound_date, 120)
      ORDER BY month
    `, { replacements: { wn, ...factoryReps } });

    const [backlogItems]: any = await sequelize.query(`
      SELECT TOP 10 item_number, item_name, SUM(quantity) AS total_qty,
             MIN(DATEDIFF(day, inbound_date, GETDATE())) AS max_days
      FROM finished_batch_inventory
      WHERE ${baseWhere} AND DATEDIFF(day, inbound_date, GETDATE()) > 7
      GROUP BY item_number, item_name
      ORDER BY max_days DESC
    `, { replacements: { wn, ...factoryReps } });

    res.json(success({ inventory_by_item: inventoryByItem, monthly_inbound: monthlyInbound, backlog_items: backlogItems }));
  } catch (err) { next(err); }
};

export const getScrapInventoryTableData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wn = await getScrapWarehouseNumber();
    if (!wn) { res.json(success({ items: [], total: 0, page: 1, limit: 20 })); return; }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const offsetEnd = offset + limit;
    const search = req.query.search as string;

    let havingClause = '';
    const reps: any = { wn, offset, offsetEnd };
    if (search) {
      havingClause = ` HAVING item_number LIKE :search OR item_name LIKE :search`;
      reps.search = `%${search}%`;
    }

    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    if (_factoryId !== null) reps._factoryId = _factoryId;
    const baseWhere = `warehouse_number = :wn AND status <> N'冻结'${factoryCond}`;

    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) AS total FROM (
        SELECT item_number FROM finished_batch_inventory
        WHERE ${baseWhere}
        GROUP BY item_number, item_name${havingClause}
      ) AS cnt
    `, { replacements: reps });

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT item_number, MAX(item_name) AS item_name,
               MAX(specifications) AS specifications, MAX(basic_unit) AS basic_unit,
               SUM(quantity) AS total_quantity, COUNT(*) AS batch_count,
               MIN(inbound_date) AS earliest_inbound, MAX(inbound_date) AS latest_inbound,
               ROW_NUMBER() OVER (ORDER BY SUM(quantity) DESC) AS _row_num
        FROM finished_batch_inventory
        WHERE ${baseWhere}
        GROUP BY item_number, item_name${havingClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: reps });

    res.json(success({ items, total: countResult[0]?.total || 0, page, limit }));
  } catch (err) { next(err); }
};
