import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { BusinessError } from '@/shared/errors/BusinessError';
import {
  manualInboundMaterial,
  productionInboundMaterial,
  manualOutboundMaterial,
  adjustMaterialInventory as adjustMaterialInventoryService,
  rollbackSemiProductionInbound as rollbackSemiProductionInboundService,
} from '@/services/warehouse.service';

// Re-export from service for backward compatibility
export { generateBatchNumber, syncMaterialInventorySummary, syncFinishedGoodsSummary, generateMaterialTxnNumber } from '@/services/inventory.service';

// ==================== 物料库存列表 ====================
export const getInventoryList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', warehouse_number = '', item_type = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (item_number LIKE :search OR item_name LIKE :search OR specifications LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (warehouse_number) {
      whereClause += ` AND warehouse_number = :warehouse_number`;
      replacements.warehouse_number = warehouse_number;
    }
    if (item_type) {
      whereClause += ` AND item_type = :item_type`;
      replacements.item_type = item_type;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM material_inventory ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *,
               CASE WHEN safety_stock_quantity > 0 AND quantity < safety_stock_quantity THEN 1 ELSE 0 END as is_below_safety,
               ROW_NUMBER() OVER (ORDER BY item_number, warehouse_number) AS _row_num
        FROM material_inventory ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    const [summary]: any = await sequelize.query(`
      SELECT COUNT(DISTINCT item_number) as total_items,
             COUNT(DISTINCT warehouse_number) as total_warehouses,
             SUM(quantity) as total_quantity,
             SUM(CASE WHEN safety_stock_quantity > 0 AND quantity < safety_stock_quantity THEN 1 ELSE 0 END) as below_safety_count
      FROM material_inventory ${whereClause}
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

// ==================== 原材料手工入库 - Thin Adapter ====================
export const manualInbound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await manualInboundMaterial(req.body, (req as any).user?.username || '');
    res.json(success(result, '入库成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 半成品待入库列表 ====================
export const getPendingInbound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = `WHERE po.plan_status = N'已完成' AND po.approval_status = N'已审批'
      AND (po.inbound_status IS NULL OR po.inbound_status IN (N'未入库', N'部分入库'))
      AND im.item_type = N'半成品'`;
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (po.production_order_number LIKE :search OR po.item_number LIKE :search OR po.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM production_order po INNER JOIN item_master im ON po.item_number = im.item_number ${whereClause}`,
      { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT po.production_order_number, po.production_number, po.item_number, po.item_name,
               po.specifications, po.basic_unit, po.planned_quantity,
               ISNULL(po.inbound_quantity, 0) as inbound_qty,
               (po.planned_quantity - ISNULL(po.inbound_quantity, 0)) as pending_inbound_qty,
               po.production_date, po.plan_status, po.inbound_status,
               ROW_NUMBER() OVER (ORDER BY po.production_date DESC, po.production_order_number DESC) AS _row_num
        FROM production_order po
        INNER JOIN item_master im ON po.item_number = im.item_number
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

// ==================== 半成品生产完工入库 - Thin Adapter ====================
export const productionInbound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await productionInboundMaterial(req.body, (req as any).user?.username || '');
    res.json(success(result, '半成品入库成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 手工出库（支持批次FIFO） - Thin Adapter ====================
export const manualOutbound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await manualOutboundMaterial(req.body, (req as any).user?.username || '');
    res.json(success(result, '出库成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 库存调整 - Thin Adapter ====================
export const adjustInventory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adjustMaterialInventoryService(req.body, (req as any).user?.username || '');
    res.json(success(result, '库存调整成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 流水记录列表 ====================
export const getTransactionList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', transaction_type = '', source_type = '', item_type = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (transaction_number LIKE :search OR source_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (transaction_type) {
      whereClause += ` AND transaction_type = :transaction_type`;
      replacements.transaction_type = transaction_type;
    }
    if (source_type) {
      whereClause += ` AND source_type = :source_type`;
      replacements.source_type = source_type;
    }
    if (item_type) {
      whereClause += ` AND item_type = :item_type`;
      replacements.item_type = item_type;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM material_inventory_transaction ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC) AS _row_num
        FROM material_inventory_transaction ${whereClause}
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

// ==================== 安全库存预警列表 ====================
export const getSafetyStockAlerts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    const baseWhere = `WHERE mi.safety_stock_quantity > 0 AND mi.quantity < mi.safety_stock_quantity`;

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM material_inventory mi ${baseWhere}`
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT mi.item_number, mi.item_name, mi.item_type, mi.specifications, mi.basic_unit,
               mi.warehouse_number, mi.warehouse_name, mi.quantity, mi.safety_stock_quantity,
               (mi.safety_stock_quantity - mi.quantity) as shortage,
               ROW_NUMBER() OVER (ORDER BY (mi.safety_stock_quantity - mi.quantity) DESC) AS _row_num
        FROM material_inventory mi
        ${baseWhere}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { offset, offsetEnd } });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

// ==================== 更新安全库存 ====================
export const updateSafetyStock = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, warehouse_number, safety_stock_quantity } = req.body;
    if (!item_number || !warehouse_number) {
      res.status(400).json({ success: false, message: '请指定物料和仓库' }); return;
    }
    const qty = Number(safety_stock_quantity) || 0;
    if (qty < 0) {
      res.status(400).json({ success: false, message: '安全库存量不能为负数' }); return;
    }

    await sequelize.query(
      `UPDATE material_inventory SET safety_stock_quantity = :qty WHERE item_number = :item_number AND warehouse_number = :warehouse_number`,
      { replacements: { qty, item_number, warehouse_number } }
    );

    res.json(success(null, '安全库存设置成功'));
  } catch (err) { next(err); }
};

// ==================== 模糊搜索物料 (原材料/半成品) ====================
export const getItemOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keyword = (req.query.keyword as string) || '';
    const itemType = (req.query.item_type as string) || '';
    if (!keyword.trim()) { res.json(success([])); return; }

    let whereClause = `WHERE (item_number LIKE :kw OR item_name LIKE :kw)`;
    const replacements: any = { kw: `%${keyword.trim()}%` };

    if (itemType && itemType !== 'all') {
      const typeMap: Record<string, string> = { product: '成品', raw: '原材料', semi: '半成品' };
      whereClause += ` AND item_type = :itemType`;
      replacements.itemType = typeMap[itemType] || itemType;
    } else if (!itemType) {
      whereClause += ` AND item_type IN (N'原材料', N'半成品')`;
    }

    const [items]: any = await sequelize.query(`
      SELECT TOP 20 item_number, item_name, item_type, specifications, basic_unit
      FROM item_master ${whereClause}
      ORDER BY item_number
    `, { replacements });

    res.json(success(items));
  } catch (err) { next(err); }
};

// ==================== 获取仓库列表 ====================
export const getWarehouseOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(
      `SELECT warehouse_number, warehouse_name FROM warehouse WHERE [condition] = N'启用' ORDER BY warehouse_number`
    );
    res.json(success(items));
  } catch (err) { next(err); }
};

// ==================== 物料批次库存列表 ====================
export const getBatchInventory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', warehouse_number = '', item_type = '', status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (batch_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (warehouse_number) {
      whereClause += ` AND warehouse_number = :warehouse_number`;
      replacements.warehouse_number = warehouse_number;
    }
    if (item_type) {
      whereClause += ` AND item_type = :item_type`;
      replacements.item_type = item_type;
    }
    if (status) {
      whereClause += ` AND status = :status`;
      replacements.status = status;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM material_batch_inventory ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY inbound_date DESC, id DESC) AS _row_num
        FROM material_batch_inventory ${whereClause}
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

// ==================== FIFO批次推荐列表 ====================
export const getBatchOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, warehouse_number } = req.query;
    if (!item_number || !warehouse_number) {
      res.json(success([])); return;
    }

    const [items]: any = await sequelize.query(`
      SELECT batch_number, quantity, initial_quantity, inbound_date,
             supplier_number, supplier_name, production_order_number, status
      FROM material_batch_inventory
      WHERE item_number = :item_number AND warehouse_number = :warehouse_number
        AND quantity > 0 AND status = N'正常'
      ORDER BY inbound_date ASC, id ASC
    `, { replacements: { item_number, warehouse_number } });

    res.json(success(items));
  } catch (err) { next(err); }
};

// ==================== 半成品生产入库单列表 ====================
export const getSemiInboundOrderList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = '';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause = `WHERE (o.inbound_order_number LIKE :search OR o.warehouse_name LIKE :search OR o.operator LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM semi_production_inbound_order o ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT o.*, ROW_NUMBER() OVER (ORDER BY o.creation_date DESC) AS _row_num
        FROM semi_production_inbound_order o ${whereClause}
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

// ==================== 半成品生产入库单详情 ====================
export const getSemiInboundOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { inbound_order_number } = req.params;

    const [headers]: any = await sequelize.query(
      `SELECT * FROM semi_production_inbound_order WHERE inbound_order_number = :num`,
      { replacements: { num: inbound_order_number } }
    );

    const [details]: any = await sequelize.query(
      `SELECT * FROM semi_production_inbound_order_detail WHERE inbound_order_number = :num ORDER BY line_number`,
      { replacements: { num: inbound_order_number } }
    );

    res.json(success({ header: headers[0], details }));
  } catch (err) { next(err); }
};

// ==================== 半成品生产入库单撤回 ====================
export const withdrawSemiInboundOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rollbackSemiProductionInboundService(
      String(req.params.inbound_order_number),
      (req as any).user?.username || ''
    );
    res.json(success(result, '入库单撤回成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 采购退货出库列表 ====================
export const getReturnOutboundList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', return_status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    const conditions: string[] = [`pr.approval_status = N'已审批'`];
    const replacements: any = { offset, offsetEnd };

    if (search) {
      conditions.push(`(pr.return_number LIKE :search OR pr.purchase_order_number LIKE :search OR pr.supplier_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (return_status) {
      conditions.push(`pr.return_status = :return_status`);
      replacements.return_status = return_status;
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM purchase_return pr ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT pr.return_number, pr.purchase_order_number, pr.supplier_number, pr.supplier_name,
               pr.return_type, pr.return_reason, pr.warehouse_number, pr.warehouse_name,
               pr.approval_status, pr.return_status, pr.exchange_status,
               pr.total_return_quantity, pr.total_return_amount,
               pr.remark, pr.creation_date, pr.creation_man,
               po.order_status as po_order_status,
               ROW_NUMBER() OVER (ORDER BY pr.creation_date DESC, pr.return_number DESC) AS _row_num
        FROM purchase_return pr
        LEFT JOIN purchase_order po ON po.purchase_order_number = pr.purchase_order_number
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page: pageNum, limit: pageSize, totalPages: Math.ceil(total / pageSize) } }, '获取采购退货出库列表成功'));
  } catch (err) { next(err); }
};

// ==================== 采购退货出库详情（含批次库存） ====================
export const getReturnOutboundDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const [headers]: any = await sequelize.query(
      `SELECT * FROM purchase_return WHERE return_number = :id`, { replacements: { id } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '退货单不存在' }); return; }
    const header = headers[0];

    const [details]: any = await sequelize.query(
      `SELECT * FROM purchase_return_detail WHERE return_number = :id ORDER BY line_number`, { replacements: { id } }
    );

    // 补充每个明细行的批次库存信息
    const detailsWithBatch = [];
    for (const d of details) {
      const [batches]: any = await sequelize.query(`
        SELECT batch_number, quantity, inbound_date, status
        FROM material_batch_inventory
        WHERE item_number = :item_number AND warehouse_number = :warehouse_number AND quantity > 0 AND status != N'冻结'
        ORDER BY inbound_date ASC
      `, { replacements: { item_number: d.item_number, warehouse_number: header.warehouse_number } });

      // 查询当前物料在仓库的汇总库存
      const [invRows]: any = await sequelize.query(
        `SELECT ISNULL(quantity, 0) as current_stock FROM material_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number`,
        { replacements: { item_number: d.item_number, warehouse_number: header.warehouse_number } }
      );

      detailsWithBatch.push({
        ...d,
        current_stock: parseFloat(invRows[0]?.current_stock) || 0,
        batches
      });
    }

    // 查询关联的采购入库单信息
    const [stockInRows]: any = await sequelize.query(`
      SELECT DISTINCT si.stock_in_number, si.approval_status as si_status, si.stock_in_date
      FROM stock_in si
      INNER JOIN stock_in_detail sid ON sid.stock_in_number = si.stock_in_number
      WHERE si.purchase_order_number = :pon AND si.approval_status = N'已入库'
    `, { replacements: { pon: header.purchase_order_number } });

    res.json(success({ header, details: detailsWithBatch, stockIns: stockInRows }, '获取退货出库详情成功'));
  } catch (err) { next(err); }
};

// ==================== 执行采购退货出库（代理） ====================
export const executeReturnOutbound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 代理调用 purchaseReturn.controller 的 executeReturn
    const { executeReturn } = await import('../../purchasing/purchaseReturn/purchaseReturn.controller');
    await executeReturn(req, res, next);
  } catch (err) { next(err); }
};
