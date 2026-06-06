import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

/**
 * 有效期管理报告
 * 基于物料主数据的"启用有效期"和"有效天数"，结合批次库存的生产日期/入库日期，
 * 计算到期日，按到期状态分类展示
 */

const EXPIRE_WARNING_DAYS = 30; // 即将到期预警天数

// 到期日期计算（优先生产日期，回退入库日期）
const expiryDateExpr = (alias: string) =>
  `CASE WHEN ${alias}.production_date IS NOT NULL
    THEN DATEADD(DAY, im.shelf_life_days, ${alias}.production_date)
    ELSE DATEADD(DAY, im.shelf_life_days, ${alias}.inbound_date) END`;

// 到期状态判定
const expireStatusExpr = (alias: string) =>
  `CASE
    WHEN ${expiryDateExpr(alias)} < GETDATE() THEN N'已到期'
    WHEN DATEADD(DAY, -${EXPIRE_WARNING_DAYS}, ${expiryDateExpr(alias)}) < GETDATE() THEN N'即将到期'
    ELSE N'未到期'
  END`;

export const getShelfLifeReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { warehouse_number, item_type, expire_status, search, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // 动态条件（外层，引用别名 b）
    const conditions: string[] = [`COALESCE(b.quantity, 0) > 0`];
    const replacements: any = {};

    if (warehouse_number) {
      conditions.push(`b.warehouse_number = :warehouse_number`);
      replacements.warehouse_number = warehouse_number;
    }
    if (item_type) {
      conditions.push(`b.item_type = :item_type`);
      replacements.item_type = item_type;
    }
    if (search) {
      conditions.push(`(b.item_number LIKE :search OR b.item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (expire_status) {
      conditions.push(`expire_status = :expire_status`);
      replacements.expire_status = expire_status;
    }

    // 多工厂数据隔离过滤
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      conditions.push(`b.factory_id = :_factoryId`);
      replacements._factoryId = _factoryId;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // UNION 原材料批次 + 成品批次（半成品也在material_batch_inventory中item_type='半成品'）
    const unionSql = `
      -- 原材料 & 半成品批次
      SELECT mb.batch_number, mb.item_number, mb.item_name, mb.item_type,
             mb.warehouse_number, mb.warehouse_name, mb.quantity,
             mb.production_date, mb.inbound_date,
             im.shelf_life_days,
             ${expiryDateExpr('mb')} AS expiry_date,
             ${expireStatusExpr('mb')} AS expire_status,
             f.factory_name, f.factory_short
      FROM material_batch_inventory mb
      JOIN item_master im ON mb.item_number = im.item_number
      LEFT JOIN factory f ON mb.factory_id = f.id
      WHERE im.enable_shelf_life = N'Y' AND mb.quantity > 0

      UNION ALL

      -- 成品批次
      SELECT fb.batch_number, fb.item_number, fb.item_name, N'成品' AS item_type,
             fb.warehouse_number, fb.warehouse_name, fb.quantity,
             fb.production_date, fb.inbound_date,
             im.shelf_life_days,
             ${expiryDateExpr('fb')} AS expiry_date,
             ${expireStatusExpr('fb')} AS expire_status,
             f.factory_name, f.factory_short
      FROM finished_batch_inventory fb
      JOIN item_master im ON fb.item_number = im.item_number
      LEFT JOIN factory f ON fb.factory_id = f.id
      WHERE im.enable_shelf_life = N'Y' AND fb.quantity > 0
    `;

    // 计数
    const countSql = `SELECT COUNT(*) as total FROM (${unionSql}) b ${whereClause}`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const total = countResult[0]?.total || 0;

    // 分页查询（ROW_NUMBER兼容旧版SQL Server）
    const dataSql = `SELECT * FROM (SELECT ROW_NUMBER() OVER (ORDER BY expiry_date) AS rownum, * FROM (${unionSql}) b ${whereClause}) t WHERE t.rownum > ${offset} AND t.rownum <= ${offset + Number(limit)}`;
    const [items]: any = await sequelize.query(dataSql, { replacements });

    res.json(success({ items, total, page: Number(page), limit: Number(limit) }, '获取有效期报告成功'));
  } catch (err) { next(err); }
};
