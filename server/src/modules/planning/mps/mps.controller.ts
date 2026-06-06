import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { generateProductionNumber } from '@/services/documentNumber.service';
import { getFactoryCode, getFactoryId } from '@/utils/factoryWhere.util';

// ==================== MPS 主计划计算 ====================
export const calculateMPS = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date, end_date, customer_number } = req.query;

    // ---------- 1. 已审批预测剩余需求(按物料汇总) ----------
    let forecastWhere = `WHERE f.approval_status = N'已审批' AND fd.remaining_quantity > 0`;
    const forecastReplacements: any = {};

    if (start_date) {
      forecastWhere += ` AND fd.end_date >= :start_date`;
      forecastReplacements.start_date = start_date;
    }
    if (end_date) {
      forecastWhere += ` AND fd.start_date <= :end_date`;
      forecastReplacements.end_date = end_date;
    }
    if (customer_number) {
      forecastWhere += ` AND f.customer_number = :fc_customer`;
      forecastReplacements.fc_customer = customer_number;
    }

    const [forecastItems]: any = await sequelize.query(`
      SELECT fd.item_number, fd.item_name, fd.specifications, fd.basic_unit, fd.product_drawing_number,
             SUM(fd.remaining_quantity) AS forecast_demand
      FROM sales_forecast_detail fd
      INNER JOIN sales_forecast f ON f.forecast_number = fd.forecast_number
      ${forecastWhere}
      GROUP BY fd.item_number, fd.item_name, fd.specifications, fd.basic_unit, fd.product_drawing_number
    `, { replacements: forecastReplacements });

    // ---------- 2. 已审批销售订单需求(按物料汇总, 仅未完成发货部分) ----------
    let orderWhere = `WHERE h.approval_status = N'已审批' AND d.shipping_status IN (N'未申请', N'未发货', N'部分发货') AND (d.production_status IS NULL OR d.production_status NOT IN (N'待排产', N'计划中', N'待生产', N'生产中'))`;
    const orderReplacements: any = {};

    if (start_date) {
      orderWhere += ` AND (d.delivery_date >= :start_date OR h.delivery_date >= :start_date)`;
      orderReplacements.start_date = start_date;
    }
    if (end_date) {
      orderWhere += ` AND (d.delivery_date <= :end_date OR h.delivery_date <= :end_date)`;
      orderReplacements.end_date = end_date;
    }
    if (customer_number) {
      orderWhere += ` AND h.customer_number = :so_customer`;
      orderReplacements.so_customer = customer_number;
    }

    const [orderItems]: any = await sequelize.query(`
      SELECT d.item_number, d.item_name, d.specifications, d.basic_unit, d.product_drawing_number,
             SUM(d.order_quantity) AS total_order_quantity,
             SUM(ISNULL(d.shipped_quantity, 0)) AS total_shipped_quantity,
             SUM(ISNULL(d.refunded_quantity, 0)) AS total_refunded_quantity,
             SUM(d.order_quantity - ISNULL(d.shipped_quantity, 0) + ISNULL(d.refunded_quantity, 0)) AS order_demand
      FROM sales_order_detail d
      INNER JOIN sales_order h ON h.sales_order_number = d.sales_order_number
      ${orderWhere}
      GROUP BY d.item_number, d.item_name, d.specifications, d.basic_unit, d.product_drawing_number
    `, { replacements: orderReplacements });

    // ---------- 3. 合并: MAX(forecast_remaining, order_demand) 去重 ----------
    const demandMap = new Map<string, {
      item_number: string; item_name: string; specifications: string; basic_unit: string;
      product_drawing_number: string; forecast_demand: number; order_demand: number; gross_demand: number;
      total_order_quantity: number; total_shipped_quantity: number; total_refunded_quantity: number;
    }>();

    for (const fc of forecastItems) {
      demandMap.set(fc.item_number, {
        item_number: fc.item_number,
        item_name: fc.item_name,
        specifications: fc.specifications,
        basic_unit: fc.basic_unit,
        product_drawing_number: fc.product_drawing_number,
        forecast_demand: Number(fc.forecast_demand) || 0,
        order_demand: 0,
        gross_demand: Number(fc.forecast_demand) || 0,
        total_order_quantity: 0,
        total_shipped_quantity: 0,
        total_refunded_quantity: 0,
      });
    }

    for (const so of orderItems) {
      const existing = demandMap.get(so.item_number);
      const orderDemand = Number(so.order_demand) || 0;
      const totalOrderQty = Number(so.total_order_quantity) || 0;
      const totalShippedQty = Number(so.total_shipped_quantity) || 0;
      const totalRefundedQty = Number(so.total_refunded_quantity) || 0;
      if (existing) {
        existing.order_demand = orderDemand;
        existing.gross_demand = Math.max(existing.forecast_demand, orderDemand);
        existing.total_order_quantity = totalOrderQty;
        existing.total_shipped_quantity = totalShippedQty;
        existing.total_refunded_quantity = totalRefundedQty;
      } else {
        demandMap.set(so.item_number, {
          item_number: so.item_number,
          item_name: so.item_name,
          specifications: so.specifications,
          basic_unit: so.basic_unit,
          product_drawing_number: so.product_drawing_number,
          forecast_demand: 0,
          order_demand: orderDemand,
          gross_demand: orderDemand,
          total_order_quantity: totalOrderQty,
          total_shipped_quantity: totalShippedQty,
          total_refunded_quantity: totalRefundedQty,
        });
      }
    }

    // ---------- 4. 查库存 + 安全库存 ----------
    const itemNumbers = [...demandMap.keys()];
    if (itemNumbers.length === 0) {
      res.json(success({ items: [], summary: { total_items: 0 } }, 'MPS 计算完成'));
      return;
    }

    // 使用参数化查询拼接
    const itemPlaceholders = itemNumbers.map((_, i) => `:item_${i}`).join(', ');
    const itemReplacements: any = {};
    itemNumbers.forEach((num, i) => { itemReplacements[`item_${i}`] = num; });

    const [inventoryRows]: any = await sequelize.query(`
      SELECT item_number,
             SUM(quantity) AS on_hand,
             SUM(ISNULL(safety_stock_quantity, 0)) AS safety_stock
      FROM finished_goods_inventory
      WHERE item_number IN (${itemPlaceholders})
      GROUP BY item_number
    `, { replacements: itemReplacements });

    const inventoryMap = new Map<string, { on_hand: number; safety_stock: number }>();
    for (const row of inventoryRows) {
      inventoryMap.set(row.item_number, {
        on_hand: Number(row.on_hand) || 0,
        safety_stock: Number(row.safety_stock) || 0,
      });
    }

    // 查采购在途数(已审批采购订单中尚未完全入库的数量)
    const [inTransitRows]: any = await sequelize.query(`
      SELECT d.item_number, SUM(d.order_quantity - ISNULL(d.received_quantity, 0)) AS in_transit
      FROM purchase_order_detail d
      INNER JOIN purchase_order h ON h.purchase_order_number = d.purchase_order_number
      WHERE h.approval_status = N'已审批'
        AND d.item_number IN (${itemPlaceholders})
      GROUP BY d.item_number
    `, { replacements: itemReplacements });

    const inTransitMap = new Map<string, number>();
    for (const row of inTransitRows) {
      inTransitMap.set(row.item_number, Number(row.in_transit) || 0);
    }

    // 查生产在途数(已审批且未完成的生产计划数量，扣除已入库部分)
    // 说明：已入库数量已通过入库单计入 finished_goods_inventory，此处必须扣除避免重复计算
    // 注意：JOIN 必须加 po.item_number = pp.item_number，否则 MRP 展开的子件工单会被误累加
    const [productionInTransitRows]: any = await sequelize.query(`
      SELECT pp.item_number,
             SUM(ISNULL(po.planned_quantity, 0) - ISNULL(po.inbound_quantity, 0)) AS production_in_transit
      FROM Production_plan pp
      LEFT JOIN production_order po ON po.production_number = pp.production_number
        AND po.item_number = pp.item_number
      WHERE pp.approval_status = N'已审批'
        AND pp.plan_status NOT IN (N'已完成', N'已关闭')
        AND pp.item_number IN (${itemPlaceholders})
      GROUP BY pp.item_number
    `, { replacements: itemReplacements });

    const productionInTransitMap = new Map<string, number>();
    for (const row of productionInTransitRows) {
      productionInTransitMap.set(row.item_number, Number(row.production_in_transit) || 0);
    }

    // 查产品扩展信息(胶料编号, 班产定额)
    const [prodExtRows]: any = await sequelize.query(`
      SELECT item_number, rubber_compound_number, batch_production_quota
      FROM product_ext
      WHERE item_number IN (${itemPlaceholders})
    `, { replacements: itemReplacements });

    const prodExtMap = new Map<string, { rubber_compound_number: string; batch_production_quota: string }>();
    for (const row of prodExtRows) {
      prodExtMap.set(row.item_number, {
        rubber_compound_number: row.rubber_compound_number || '',
        batch_production_quota: row.batch_production_quota || '',
      });
    }

    // ---------- 5. 计算净需求 ----------
    const mpsResults: any[] = [];
    for (const [itemNumber, demand] of demandMap) {
      const inv = inventoryMap.get(itemNumber) || { on_hand: 0, safety_stock: 0 };
      const inTransit = inTransitMap.get(itemNumber) || 0;
      const productionInTransit = productionInTransitMap.get(itemNumber) || 0;
      const prodExt = prodExtMap.get(itemNumber) || { rubber_compound_number: '', batch_production_quota: '' };

      // 净需求 = MAX(0, 毛需求 - 库存现有量 - 采购在途 - 生产在途 + 安全库存)
      const netDemand = Math.max(0, demand.gross_demand - inv.on_hand - inTransit - productionInTransit + inv.safety_stock);

      mpsResults.push({
        item_number: itemNumber,
        item_name: demand.item_name,
        specifications: demand.specifications,
        basic_unit: demand.basic_unit,
        product_drawing_number: demand.product_drawing_number,
        rubber_compound_number: prodExt.rubber_compound_number,
        batch_production_quota: prodExt.batch_production_quota,
        forecast_demand: demand.forecast_demand,
        order_demand: demand.order_demand,
        total_order_quantity: demand.total_order_quantity,
        total_shipped_quantity: demand.total_shipped_quantity,
        total_refunded_quantity: demand.total_refunded_quantity,
        gross_demand: demand.gross_demand,
        on_hand: inv.on_hand,
        in_transit: inTransit,
        production_in_transit: productionInTransit,
        safety_stock: inv.safety_stock,
        net_demand: netDemand,
      });
    }

    // 按净需求降序排列
    mpsResults.sort((a, b) => b.net_demand - a.net_demand);

    res.json(success({
      items: mpsResults,
      summary: {
        total_items: mpsResults.length,
        items_need_production: mpsResults.filter(i => i.net_demand > 0).length,
      }
    }, 'MPS 计算完成'));
  } catch (err) { next(err); }
};

// ==================== 将 MPS 结果导入生产计划 ====================
export const importToPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const b = req.body;
    if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
      res.status(400).json({ success: false, message: '请选择至少一条MPS结果' });
      return;
    }

    const items = b.items;

    const transaction = await sequelize.transaction();
    let imported = 0;
    const results: any[] = [];

    try {
      const factoryCode = await getFactoryCode(req);
      for (const item of items) {
        if (!item.item_number || !item.net_demand || item.net_demand <= 0) continue;

        const production_number = await generateProductionNumber(factoryCode, transaction);
        const planned_quantity = item.planned_quantity || item.net_demand;
        const bpq = parseFloat(item.batch_production_quota);
        const shifts_number = (bpq && bpq > 0) ? Math.ceil(planned_quantity / bpq) : null;

        await sequelize.query(`
          INSERT INTO Production_plan (production_number, item_number, item_name, basic_unit, specifications,
            product_drawing_number, rubber_compound_number, batch_production_quota,
            planned_quantity, shifts_number, planned_completion_time, plan_status, remark, approval_status,
            source_order_number, source_line_number)
          VALUES (:production_number, :item_number, :item_name, :basic_unit, :specifications,
            :product_drawing_number, :rubber_compound_number, :batch_production_quota,
            :planned_quantity, :shifts_number, :planned_completion_time, N'待加入任务', :remark, N'草稿',
            N'MPS', NULL)
        `, {
          replacements: {
            production_number,
            item_number: item.item_number,
            item_name: item.item_name || '',
            basic_unit: item.basic_unit || '',
            specifications: item.specifications || '',
            product_drawing_number: item.product_drawing_number || '',
            rubber_compound_number: item.rubber_compound_number || '',
            batch_production_quota: item.batch_production_quota || '',
            planned_quantity,
            shifts_number,
            planned_completion_time: item.planned_completion_time || null,
            remark: `MPS计算导入, 净需求: ${item.net_demand}`,
          },
          transaction
        });

        // 按数量精确匹配预测明细行，更新 status 为 '计划中'
        const [forecastDetails]: any = await sequelize.query(`
          SELECT fd.id, fd.remaining_quantity
          FROM sales_forecast_detail fd
          INNER JOIN sales_forecast f ON f.forecast_number = fd.forecast_number
          WHERE f.approval_status = N'已审批'
            AND fd.item_number = :item_number
            AND fd.status = N'未开始'
            AND fd.remaining_quantity > 0
          ORDER BY fd.start_date ASC, fd.end_date ASC, fd.id ASC
        `, { replacements: { item_number: item.item_number }, transaction });

        let remainingToMark = planned_quantity;
        for (const fd of forecastDetails) {
          if (remainingToMark <= 0) break;
          await sequelize.query(
            `UPDATE sales_forecast_detail SET status = N'计划中' WHERE id = :id`,
            { replacements: { id: fd.id }, transaction }
          );
          remainingToMark -= Number(fd.remaining_quantity) || 0;
        }

        results.push({ production_number, item_number: item.item_number });
        imported++;
      }

      await transaction.commit();
      res.json(success({ imported, results }, `成功导入 ${imported} 条生产计划`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 获取某物料的需求来源混合列表（销售订单 + 销售预测） ====================
export const getDemandSources = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number = '' } = req.query;
    if (!item_number) {
      res.status(400).json({ success: false, message: '产品编号不能为空' });
      return;
    }

    // 查询销售订单明细
    const [orderItems]: any = await sequelize.query(`
      SELECT d.id as detail_id, d.sales_order_number as source_number, d.line_number,
             d.item_number, d.item_name, d.specifications, d.basic_unit,
             d.product_drawing_number, d.order_quantity as quantity, d.delivery_date,
             d.status, d.shipping_status, d.production_status, d.return_status,
             ISNULL(d.shipped_quantity, 0) as shipped_quantity,
             d.order_quantity - ISNULL(d.shipped_quantity, 0) as remaining_quantity,
             d.remark as detail_remark,
             d.customer_item_number, d.customer_item_description,
             h.customer_number, h.customer_name, h.delivery_date as header_delivery_date,
             ISNULL(pe.rubber_compound_number, '') as rubber_compound_number,
             ISNULL(pe.batch_production_quota, '') as batch_production_quota
      FROM sales_order_detail d
      INNER JOIN sales_order h ON h.sales_order_number = d.sales_order_number
      LEFT JOIN product_ext pe ON pe.item_number = d.item_number
      WHERE d.item_number = :item_number
        AND d.shipping_status IN (N'未申请', N'未发货', N'部分发货')
        AND (d.production_status IS NULL OR d.production_status = N'未加入计划')
        AND h.approval_status = N'已审批'
      ORDER BY h.sales_order_number DESC, d.line_number
    `, { replacements: { item_number } });

    // 查询销售预测明细
    const [forecastItems]: any = await sequelize.query(`
      SELECT d.id as detail_id, d.forecast_number as source_number, d.line_number,
             d.item_number, d.item_name, d.specifications, d.basic_unit,
             d.product_drawing_number, d.remaining_quantity as quantity, d.end_date as delivery_date,
             d.status, d.consumption_status,
             d.remark as detail_remark,
             d.customer_item_number, d.customer_item_description,
             h.customer_number, h.customer_name,
             ISNULL(pe.rubber_compound_number, '') as rubber_compound_number,
             ISNULL(pe.batch_production_quota, '') as batch_production_quota
      FROM sales_forecast_detail d
      INNER JOIN sales_forecast h ON h.forecast_number = d.forecast_number
      LEFT JOIN product_ext pe ON pe.item_number = d.item_number
      WHERE d.item_number = :item_number
        AND d.status = N'未开始'
        AND h.approval_status = N'已审批'
        AND d.remaining_quantity > 0
      ORDER BY h.forecast_number DESC, d.line_number
    `, { replacements: { item_number } });

    // 合并为统一列表
    const results: any[] = [];
    for (const o of orderItems) {
      results.push({ ...o, source_type: 'ORDER', source_type_name: '销售订单' });
    }
    for (const f of forecastItems) {
      results.push({ ...f, source_type: 'FORECAST', source_type_name: '销售预测', shipping_status: '-', production_status: '-', return_status: '-' });
    }

    res.json(success(results));
  } catch (err) { next(err); }
};

// ==================== 从需求来源混合列表导入生产计划 ====================
export const importFromDemandSources = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const b = req.body;
    if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
      res.status(400).json({ success: false, message: '请选择至少一条记录' });
      return;
    }

    const items = b.items;

    const transaction = await sequelize.transaction();
    let imported = 0;
    const results: any[] = [];

    try {
      const factoryCode = await getFactoryCode(req);
      for (const item of items) {
        const production_number = await generateProductionNumber(factoryCode, transaction);
        const planned_quantity = item.remaining_quantity || item.quantity || 0;
        const bpq = parseFloat(item.batch_production_quota);
        const shifts_number = (bpq && bpq > 0) ? Math.ceil(planned_quantity / bpq) : null;
        const planned_completion_time = item.delivery_date || item.header_delivery_date || null;

        await sequelize.query(`
          INSERT INTO Production_plan (production_number, item_number, item_name, basic_unit, specifications,
            product_drawing_number, rubber_compound_number, batch_production_quota,
            planned_quantity, shifts_number, planned_completion_time, plan_status, remark, approval_status,
            source_order_number, source_line_number, customer_item_number, customer_item_description)
          VALUES (:production_number, :item_number, :item_name, :basic_unit, :specifications,
            :product_drawing_number, :rubber_compound_number, :batch_production_quota,
            :planned_quantity, :shifts_number, :planned_completion_time, N'待加入任务', :remark, N'草稿',
            :source_order_number, :source_line_number, :customer_item_number, :customer_item_description)
        `, {
          replacements: {
            production_number,
            item_number: item.item_number || '',
            item_name: item.item_name || '',
            basic_unit: item.basic_unit || '',
            specifications: item.specifications || '',
            product_drawing_number: item.product_drawing_number || '',
            rubber_compound_number: item.rubber_compound_number || '',
            batch_production_quota: item.batch_production_quota || '',
            planned_quantity,
            shifts_number,
            planned_completion_time,
            remark: '',
            source_order_number: item.source_number || '',
            source_line_number: item.line_number || null,
            customer_item_number: item.customer_item_number || '',
            customer_item_description: item.customer_item_description || ''
          },
          transaction
        });

        // 根据来源类型回写源单状态
        if (item.source_type === 'ORDER' && item.detail_id) {
          await sequelize.query(
            `UPDATE sales_order_detail SET production_status = N'待排产', status = N'进行中' WHERE id = :id AND (production_status IS NULL OR production_status = N'未加入计划')`,
            { replacements: { id: item.detail_id }, transaction }
          );
          // 更新销售订单主表状态
          await sequelize.query(
            `UPDATE sales_order SET order_status = N'生产中' WHERE sales_order_number = :son AND order_status = N'待执行'`,
            { replacements: { son: item.source_number }, transaction }
          );
        } else if (item.source_type === 'FORECAST' && item.detail_id) {
          await sequelize.query(
            `UPDATE sales_forecast_detail SET status = N'计划中' WHERE id = :id AND status = N'未开始'`,
            { replacements: { id: item.detail_id }, transaction }
          );
        }

        results.push({ production_number, source_type: item.source_type, source_number: item.source_number, line_number: item.line_number });
        imported++;
      }

      await transaction.commit();
      res.json(success({ imported, results }, `成功导入 ${imported} 条生产计划`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 获取未完成发货的销售订单明细（供MPS导入） ====================
export const getSalesOrdersForMpsImport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search = '' } = req.query;

    let whereClause = `WHERE d.shipping_status IN (N'未申请', N'未发货', N'部分发货') AND h.approval_status = N'已审批'`;
    const replacements: any = {};

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause += ' AND h.factory_id = :_factoryId';
      replacements._factoryId = _factoryId;
    }

    if (search) {
      whereClause += ` AND (h.sales_order_number LIKE :search OR h.customer_name LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [items]: any = await sequelize.query(`
      SELECT d.id as detail_id, d.sales_order_number, d.line_number,
             d.item_number, d.item_name, d.specifications, d.basic_unit,
             d.product_drawing_number, d.order_quantity, d.delivery_date,
             d.status, d.shipping_status, d.production_status, d.return_status,
             ISNULL(d.shipped_quantity, 0) as shipped_quantity,
             d.order_quantity - ISNULL(d.shipped_quantity, 0) as unshipped_quantity,
             d.remark as detail_remark,
             h.customer_number, h.customer_name, h.delivery_date as header_delivery_date,
             ISNULL(pe.rubber_compound_number, '') as rubber_compound_number,
             ISNULL(pe.batch_production_quota, '') as batch_production_quota
      FROM sales_order_detail d
      INNER JOIN sales_order h ON h.sales_order_number = d.sales_order_number
      LEFT JOIN product_ext pe ON pe.item_number = d.item_number
      ${whereClause}
      ORDER BY h.sales_order_number DESC, d.line_number
    `, { replacements });

    res.json(success(items));
  } catch (err) { next(err); }
};
