import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { BusinessError } from '@/shared/errors/BusinessError';
import {
  productionInboundFinished,
  shippingOutbound as shippingOutboundService,
  returnInbound as returnInboundService,
  adjustFinishedInventory as adjustFinishedInventoryService,
  rollbackShippingOutbound as rollbackShippingOutboundService,
  rollbackProductionInbound as rollbackProductionInboundService,
} from '@/services/warehouse.service';

// Re-export from service for backward compatibility
export { generateTransactionNumber } from '@/services/inventory.service';

// ==================== 库存查询（成品+原材料） ====================
export const getInventoryList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', warehouse_number = '', quality_status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    // 构建成品库存的 WHERE 条件
    let fgWhere = 'WHERE 1=1';
    // 构建原材料库存的 WHERE 条件
    let matWhere = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      const searchCond = ` AND (item_number LIKE :search OR item_name LIKE :search OR specifications LIKE :search)`;
      fgWhere += searchCond;
      matWhere += searchCond;
      replacements.search = `%${search}%`;
    }
    if (warehouse_number) {
      const whCond = ` AND warehouse_number = :warehouse_number`;
      fgWhere += whCond;
      matWhere += whCond;
      replacements.warehouse_number = warehouse_number;
    }
    if (quality_status) {
      fgWhere += ` AND quality_status = :quality_status`;
      replacements.quality_status = quality_status;
      // 筛选合格品时，原材料默认都是合格品，也应包含
      // 筛选不合格品/待检品时，原材料无此分类，不包含
      if (quality_status === '合格品') {
        // matWhere 不加 quality_status 条件，原材料全部视为合格品
      } else {
        // 不合格品/待检品 → 原材料无匹配，用不可能条件排除
        matWhere += ` AND 1=0`;
      }
    }

    // UNION ALL 合并成品和原材料库存
    const unionQuery = `
      SELECT id, item_number, item_name, specifications, basic_unit, product_drawing_number,
             warehouse_number, warehouse_name, quantity, quality_status, last_updated, creation_date,
             ISNULL(safety_stock_quantity, 0) as safety_stock_quantity,
             N'成品' as inventory_type
      FROM finished_goods_inventory ${fgWhere}
      UNION ALL
      SELECT id, item_number, item_name, specifications, basic_unit, '' as product_drawing_number,
             warehouse_number, warehouse_name, quantity, N'合格品' as quality_status, last_updated, creation_date,
             ISNULL(safety_stock_quantity, 0) as safety_stock_quantity,
             N'原材料' as inventory_type
      FROM material_inventory ${matWhere}
    `;

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM (${unionQuery}) AS u`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY inventory_type DESC, item_number, warehouse_number) AS _row_num
        FROM (${unionQuery}) AS u
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    // 汇总统计（total_items 按物料编码去重）
    const [summary]: any = await sequelize.query(`
      SELECT COUNT(DISTINCT item_number) as total_items,
             COUNT(DISTINCT warehouse_number) as total_warehouses,
             SUM(quantity) as total_quantity
      FROM (${unionQuery}) AS u
    `, { replacements: { ...replacements } });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize,
      summary: summary[0] || {}
    }));
  } catch (err) { next(err); }
};

// ==================== 库存详情（含流水） ====================
export const getInventoryDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, warehouse_number, inventory_type } = req.query;
    if (!item_number) { res.status(400).json({ success: false, message: '请提供物料编号' }); return; }

    const isMaterial = inventory_type === '原材料';
    const invTable = isMaterial ? 'material_inventory' : 'finished_goods_inventory';
    const txTable = isMaterial ? 'material_inventory_transaction' : 'inventory_transaction';

    let invWhere = `WHERE item_number = :item_number`;
    const invReplacements: any = { item_number };
    if (warehouse_number) {
      invWhere += ` AND warehouse_number = :warehouse_number`;
      invReplacements.warehouse_number = warehouse_number;
    }

    const [inventory]: any = await sequelize.query(
      `SELECT * FROM ${invTable} ${invWhere}`, { replacements: invReplacements }
    );

    let txWhere = `WHERE item_number = :item_number`;
    const txReplacements: any = { item_number };
    if (warehouse_number) {
      txWhere += ` AND warehouse_number = :warehouse_number`;
      txReplacements.warehouse_number = warehouse_number;
    }

    const [transactions]: any = await sequelize.query(
      `SELECT TOP 100 * FROM ${txTable} ${txWhere} ORDER BY creation_date DESC`,
      { replacements: txReplacements }
    );

    res.json(success({ inventory, transactions }));
  } catch (err) { next(err); }
};

// ==================== 待入库列表（已完成的生产单） ====================
export const getPendingInbound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = `WHERE plan_status = N'已完成' AND approval_status = N'已审批' AND (inbound_status IS NULL OR inbound_status IN (N'未入库', N'部分入库'))`;
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (production_order_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search OR production_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM production_order ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *,
               ISNULL(inbound_quantity, 0) as inbound_qty,
               (planned_quantity - ISNULL(inbound_quantity, 0)) as pending_inbound_qty,
               ROW_NUMBER() OVER (ORDER BY production_date DESC, production_order_number DESC) AS _row_num
        FROM production_order ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

// ==================== 生产完工入库（批次化）- Thin Adapter ====================
export const productionInbound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await productionInboundFinished(req.body, (req as any).user?.username || '');
    res.json(success(result, '入库成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 生产入库单列表 ====================
export const getInboundOrderList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = '';
    if (search) {
      whereClause = `WHERE (o.inbound_order_number LIKE :search OR o.warehouse_name LIKE :search OR o.operator LIKE :search)`;
    }

    const [countRows]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM production_inbound_order o ${whereClause}`,
      { replacements: search ? { search: `%${search}%` } : {} }
    );

    const [rows]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT o.*, ROW_NUMBER() OVER (ORDER BY o.creation_date DESC) AS _row_num
        FROM production_inbound_order o
        ${whereClause}
      ) t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, {
      replacements: {
        ...(search ? { search: `%${search}%` } : {}),
        offset, offsetEnd
      }
    });

    res.json(success({
      items: rows,
      total: countRows[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

// ==================== 生产入库单详情 ====================
export const getInboundOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { inbound_order_number } = req.params;

    const [headers]: any = await sequelize.query(
      `SELECT * FROM production_inbound_order WHERE inbound_order_number = :num`,
      { replacements: { num: inbound_order_number } }
    );
    if (headers.length === 0) {
      res.status(404).json({ success: false, message: '入库单不存在' }); return;
    }

    const [details]: any = await sequelize.query(
      `SELECT * FROM production_inbound_order_detail WHERE inbound_order_number = :num ORDER BY line_number`,
      { replacements: { num: inbound_order_number } }
    );

    res.json(success({ header: headers[0], details }));
  } catch (err) { next(err); }
};

// ==================== 待出库列表（已审核的发货申请） ====================
export const getPendingOutbound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = `WHERE h.status = N'已审核'`;
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (h.request_number LIKE :search OR h.customer_name LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM shipping_request_detail d
       INNER JOIN shipping_request h ON h.request_number = d.request_number
       ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT d.*, h.customer_number, h.customer_name, h.request_date, h.status as request_status,
               h.creation_man,
               ROW_NUMBER() OVER (ORDER BY h.request_number, d.line_number) AS _row_num
        FROM shipping_request_detail d
        INNER JOIN shipping_request h ON h.request_number = d.request_number
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

// ==================== 发货出库（批次FIFO）- Thin Adapter ====================
export const shippingOutbound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await shippingOutboundService(req.body, (req as any).user?.username || '');
    res.json(success(result, '出库成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 库存流水记录列表 ====================
export const getTransactionList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', transaction_type = '', source_type = '', status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    // 状态筛选：默认显示全部，传'正常'只显示正常，传'作废'只显示作废
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
        ROW_NUMBER() OVER (ORDER BY t.creation_date DESC) AS _row_num
      FROM inventory_transaction t LEFT JOIN item_master im ON t.item_number = im.item_number
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

// ==================== 手动调整库存 - Thin Adapter ====================
export const adjustInventory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adjustFinishedInventoryService(req.body, (req as any).user?.username || '');
    res.json(success(result, '库存调整成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 获取仓库列表(用于下拉选择) ====================
export const getWarehouseOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(
      `SELECT warehouse_number, warehouse_name FROM warehouse WHERE condition = N'启用' ORDER BY warehouse_number`
    );
    res.json(success(items));
  } catch (err) { next(err); }
};

// ==================== 成品批次库存列表 ====================
export const getFinishedBatchInventory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', warehouse_number = '', status = '', quality_status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (batch_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search OR production_order_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (warehouse_number) {
      whereClause += ` AND warehouse_number = :warehouse_number`;
      replacements.warehouse_number = warehouse_number;
    }
    if (status) {
      whereClause += ` AND status = :status`;
      replacements.status = status;
    }
    if (quality_status) {
      whereClause += ` AND quality_status = :quality_status`;
      replacements.quality_status = quality_status;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM finished_batch_inventory ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY inbound_date DESC, id DESC) AS _row_num
        FROM finished_batch_inventory ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

// ==================== 成品/原材料批次选项（FIFO排序，供出库/查看选择） ====================
export const getFinishedBatchOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, warehouse_number, inventory_type } = req.query;
    if (!item_number) {
      res.status(400).json({ success: false, message: '请提供物料编号' }); return;
    }

    if (inventory_type === '原材料') {
      // 原材料批次查询
      let whereClause = `WHERE item_number = :item_number AND quantity > 0 AND status = N'正常'`;
      const replacements: any = { item_number };
      if (warehouse_number) {
        whereClause += ` AND warehouse_number = :warehouse_number`;
        replacements.warehouse_number = warehouse_number;
      }
      const [items]: any = await sequelize.query(`
        SELECT id, batch_number, item_number, item_name, specifications, warehouse_number, warehouse_name,
               quantity, initial_quantity, supplier_number, supplier_name, inbound_date
        FROM material_batch_inventory ${whereClause}
        ORDER BY inbound_date ASC, id ASC
      `, { replacements });
      res.json(success(items));
    } else {
      // 成品批次查询（原有逻辑）
      let whereClause = `WHERE item_number = :item_number AND quantity > 0 AND status = N'正常' AND quality_status = N'合格品'`;
      const replacements: any = { item_number };
      if (warehouse_number) {
        whereClause += ` AND warehouse_number = :warehouse_number`;
        replacements.warehouse_number = warehouse_number;
      }
      const [items]: any = await sequelize.query(`
        SELECT id, batch_number, item_number, item_name, specifications, warehouse_number, warehouse_name,
               quantity, initial_quantity, production_order_number, inbound_date
        FROM finished_batch_inventory ${whereClause}
        ORDER BY inbound_date ASC, id ASC
      `, { replacements });
      res.json(success(items));
    }
  } catch (err) { next(err); }
};

// ==================== 更新成品安全库存 ====================
export const updateFinishedGoodsSafetyStock = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, warehouse_number, safety_stock_quantity } = req.body;
    if (!item_number || !warehouse_number) {
      res.status(400).json({ success: false, message: '物料编号和仓库编号不能为空' }); return;
    }
    const qty = Number(safety_stock_quantity) || 0;

    const [existing]: any = await sequelize.query(
      `SELECT id FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number`,
      { replacements: { item_number, warehouse_number } }
    );
    if (!existing.length) { res.status(404).json({ success: false, message: '库存记录不存在' }); return; }

    await sequelize.query(
      `UPDATE finished_goods_inventory SET safety_stock_quantity = :qty WHERE id = :id`,
      { replacements: { qty, id: existing[0].id } }
    );

    res.json(success(null, '更新安全库存成功'));
  } catch (err) { next(err); }
};

// ==================== 待退货入库列表 ====================
export const getPendingReturnInbound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = `WHERE ro.approval_status = N'已审批' AND (ro.inbound_status IS NULL OR ro.inbound_status = N'待入库')`;
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (ro.return_order_number LIKE :search OR ro.customer_name LIKE :search OR ro.shipping_order_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM return_order ro ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT ro.*, ROW_NUMBER() OVER (ORDER BY ro.confirmed_date DESC, ro.return_order_number DESC) AS _row_num
        FROM return_order ro ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

// ==================== 退货入库详情（含明细和批次） ====================
export const getReturnInboundDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { return_order_number } = req.params;

    const [headerRows]: any = await sequelize.query(
      `SELECT * FROM return_order WHERE return_order_number = :rn`,
      { replacements: { rn: return_order_number } }
    );
    if (headerRows.length === 0) {
      res.status(404).json({ success: false, message: '退货单不存在' }); return;
    }

    const [details]: any = await sequelize.query(
      `SELECT * FROM return_order_detail WHERE return_order_number = :rn ORDER BY line_number`,
      { replacements: { rn: return_order_number } }
    );

    const [batches]: any = await sequelize.query(
      `SELECT * FROM return_order_batch WHERE return_order_number = :rn ORDER BY detail_id, id`,
      { replacements: { rn: return_order_number } }
    );

    const detailsWithBatches = details.map((d: any) => ({
      ...d,
      batches: batches.filter((b: any) => b.detail_id === d.id)
    }));

    res.json(success({ header: headerRows[0], details: detailsWithBatches }));
  } catch (err) { next(err); }
};

// ==================== 退货入库执行 - Thin Adapter ====================
export const returnInbound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = {
      ...req.body,
      return_order_number: req.params.return_order_number,
    };
    const result = await returnInboundService(params, (req as any).user?.username || '');
    res.json(success(result, '退货入库成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 已完成盘点单列表（下拉用） ====================
export const getCompletedStockCounts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`
      SELECT count_number, count_period, warehouse_number, warehouse_name, confirmed_date
      FROM stock_count
      WHERE status = N'已完成'
      ORDER BY count_period DESC, confirmed_date DESC
    `);
    res.json(success(items));
  } catch (err) { next(err); }
};

// ==================== 月度出入库明细报表 ====================
export const getMonthlyReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { count_number } = req.query;
    if (!count_number) {
      return res.status(400).json({ success: false, message: '请选择盘点单' });
    }

    // Step 1: 校验盘点单
    const [headers]: any = await sequelize.query(
      `SELECT count_number, count_period, warehouse_number, warehouse_name, status FROM stock_count WHERE count_number = :count_number`,
      { replacements: { count_number } }
    );
    if (!headers.length) {
      return res.status(404).json({ success: false, message: '盘点单不存在' });
    }
    const header = headers[0];
    if (header.status !== '已完成') {
      return res.status(400).json({ success: false, message: '仅已完成的盘点单可用于报表' });
    }

    // 推算报表月份
    const [year, month] = header.count_period.split('-').map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const reportMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
    const startDate = `${reportMonth}-01`;
    const afterMonth = nextMonth === 12 ? 1 : nextMonth + 1;
    const afterYear = nextMonth === 12 ? nextYear + 1 : nextYear;
    const nextMonthStart = `${afterYear}-${String(afterMonth).padStart(2, '0')}-01`;

    // Step 2: 期初数量（盘点明细按物料+质量状态汇总）
    const [openingRows]: any = await sequelize.query(`
      SELECT item_number, MAX(item_name) as item_name, MAX(specifications) as specifications,
        MAX(basic_unit) as basic_unit, MAX(product_drawing_number) as product_drawing_number,
        quality_status, SUM(ISNULL(actual_quantity, system_quantity)) as opening_qty
      FROM stock_count_detail WHERE count_number = :count_number
      GROUP BY item_number, quality_status
    `, { replacements: { count_number } });

    // Step 3: 本月交易汇总
    const [txRows]: any = await sequelize.query(`
      SELECT item_number, MAX(item_name) as item_name, MAX(specifications) as specifications,
        MAX(basic_unit) as basic_unit, MAX(product_drawing_number) as product_drawing_number,
        quality_status,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type=N'生产入库' THEN quantity ELSE 0 END) as in_production,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type=N'退货入库' THEN quantity ELSE 0 END) as in_return,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type IN (N'月末盘盈',N'盘盈调整') THEN quantity ELSE 0 END) as in_surplus,
        SUM(CASE WHEN transaction_type=N'入库' AND source_type NOT IN (N'生产入库',N'退货入库',N'月末盘盈',N'盘盈调整') THEN quantity ELSE 0 END) as in_other,
        SUM(CASE WHEN transaction_type=N'入库' THEN quantity ELSE 0 END) as in_total,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type=N'发货出库' THEN quantity ELSE 0 END) as out_shipping,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type IN (N'月末盘亏',N'盘亏调整') THEN quantity ELSE 0 END) as out_shortage,
        SUM(CASE WHEN transaction_type=N'出库' AND source_type NOT IN (N'发货出库',N'月末盘亏',N'盘亏调整') THEN quantity ELSE 0 END) as out_other,
        SUM(CASE WHEN transaction_type=N'出库' THEN quantity ELSE 0 END) as out_total
      FROM inventory_transaction
      WHERE warehouse_number = :warehouse_number
        AND operation_date >= :startDate AND operation_date < :nextMonthStart
      GROUP BY item_number, quality_status
    `, { replacements: { warehouse_number: header.warehouse_number, startDate, nextMonthStart } });

    // Step 4: Node.js 层合并
    const map = new Map<string, any>();
    const numFields = ['opening_qty', 'in_production', 'in_return', 'in_surplus', 'in_other', 'in_total', 'out_shipping', 'out_shortage', 'out_other', 'out_total', 'closing_qty'];

    for (const row of openingRows) {
      const key = `${row.item_number}|${row.quality_status || '合格品'}`;
      map.set(key, {
        item_number: row.item_number,
        item_name: row.item_name || '',
        specifications: row.specifications || '',
        basic_unit: row.basic_unit || '',
        quality_status: row.quality_status || '合格品',
        opening_qty: Number(row.opening_qty) || 0,
        in_production: 0, in_return: 0, in_surplus: 0, in_other: 0, in_total: 0,
        out_shipping: 0, out_shortage: 0, out_other: 0, out_total: 0,
        closing_qty: 0
      });
    }

    for (const row of txRows) {
      const key = `${row.item_number}|${row.quality_status || '合格品'}`;
      let item = map.get(key);
      if (!item) {
        item = {
          item_number: row.item_number,
          item_name: row.item_name || '',
          specifications: row.specifications || '',
          basic_unit: row.basic_unit || '',
          quality_status: row.quality_status || '合格品',
          opening_qty: 0,
          in_production: 0, in_return: 0, in_surplus: 0, in_other: 0, in_total: 0,
          out_shipping: 0, out_shortage: 0, out_other: 0, out_total: 0,
          closing_qty: 0
        };
        map.set(key, item);
      }
      item.in_production = Number(row.in_production) || 0;
      item.in_return = Number(row.in_return) || 0;
      item.in_surplus = Number(row.in_surplus) || 0;
      item.in_other = Number(row.in_other) || 0;
      item.in_total = Number(row.in_total) || 0;
      item.out_shipping = Number(row.out_shipping) || 0;
      item.out_shortage = Number(row.out_shortage) || 0;
      item.out_other = Number(row.out_other) || 0;
      item.out_total = Number(row.out_total) || 0;
    }

    // 计算期末 + 合计
    const totals: any = {};
    numFields.forEach(f => { totals[f] = 0; });

    const items: any[] = [];
    for (const item of map.values()) {
      item.closing_qty = item.opening_qty + item.in_total - item.out_total;
      items.push(item);
      numFields.forEach(f => { totals[f] += item[f]; });
    }

    items.sort((a: any, b: any) => a.item_number.localeCompare(b.item_number) || a.quality_status.localeCompare(b.quality_status));

    res.json(success({
      report_month: reportMonth,
      count_number: header.count_number,
      count_period: header.count_period,
      warehouse_number: header.warehouse_number,
      warehouse_name: header.warehouse_name,
      items,
      totals
    }));
  } catch (err) { next(err); }
};

// ==================== 发货出库撤回（仅最近一次）- Thin Adapter ====================
export const rollbackOutbound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rollbackShippingOutboundService(req.body.request_number, (req as any).user?.username || '');
    res.json(success(result, '出库撤回成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 生产入库撤回 - Thin Adapter ====================
export const withdrawInboundOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rollbackProductionInboundService(
      req.params.inbound_order_number as string,
      (req as any).user?.username || ''
    );
    res.json(success(result, '生产入库撤回成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};
