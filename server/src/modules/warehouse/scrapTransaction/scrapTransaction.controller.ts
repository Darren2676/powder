import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

/**
 * 报废仓库存流水记录 — 查询 inventory_transaction 中报废仓库的记录
 */
export const getScrapTransactionList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', transaction_type = '', source_type = '', status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = `WHERE t.warehouse_name = N'报废仓库'`;
    const replacements: any = { offset, offsetEnd };

    if (status) {
      whereClause += ` AND ISNULL(t.status, N'正常') = :status`;
      replacements.status = status;
    }

    if (search) {
      whereClause += ` AND (t.transaction_number LIKE :search OR t.source_number LIKE :search OR t.item_number LIKE :search OR t.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (transaction_type) {
      whereClause += ` AND t.transaction_type = :transaction_type`;
      replacements.transaction_type = transaction_type;
    }
    if (source_type) {
      whereClause += ` AND t.source_type = :source_type`;
      replacements.source_type = source_type;
    }

    // 多工厂数据隔离过滤
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += ' AND t.factory_id = :_factoryId';
      replacements._factoryId = effectiveFactoryId;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM (
        SELECT t.transaction_number
        FROM inventory_transaction t LEFT JOIN item_master im ON t.item_number = im.item_number
        ${whereClause}
      ) sub`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT t.*,
        COALESCE(NULLIF(t.item_name,''), im.item_name) AS item_name,
        COALESCE(NULLIF(t.specifications,''), im.specifications) AS specifications,
        COALESCE(NULLIF(t.basic_unit,''), im.basic_unit) AS basic_unit,
        f.factory_name, f.factory_short,
        ROW_NUMBER() OVER (ORDER BY t.creation_date DESC) AS _row_num
      FROM inventory_transaction t LEFT JOIN item_master im ON t.item_number = im.item_number LEFT JOIN factory f ON t.factory_id = f.id
      ${whereClause}
    `, { replacements });

    const items2 = (items as any[]).map((item: any) => ({
      ...item,
      _row_num: Number(item._row_num)
    })).filter((t: any) => t._row_num > offset && t._row_num <= offsetEnd);

    // 查询批次明细
    const txNumbers = items2.map((item: any) => item.transaction_number);
    const batchesMap = new Map<string, Array<{ batch_number: string; quantity: number }>>();
    if (txNumbers.length > 0) {
      const [batches]: any = await sequelize.query(
        `SELECT transaction_number, batch_number, quantity FROM inventory_transaction_batch WHERE transaction_number IN (:txNumbers) ORDER BY id`,
        { replacements: { txNumbers } }
      );
      for (const b of batches) {
        const arr = batchesMap.get(b.transaction_number) || [];
        arr.push({ batch_number: b.batch_number, quantity: b.quantity });
        batchesMap.set(b.transaction_number, arr);
      }
    }

    const result = items2.map((item: any) => ({
      ...item,
      batches: batchesMap.get(item.transaction_number) || []
    }));

    res.json(success({
      items: result,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};
