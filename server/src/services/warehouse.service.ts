/**
 * 仓库服务 - 成品仓 & 物料仓业务逻辑
 * 从 finishedGoods.controller 和 materialWarehouse.controller 抽取
 */
import sequelize from '@/config/database';
import { Transaction } from 'sequelize';
import { BusinessError } from '@/shared/errors/BusinessError';
import {
  generateBatchNumber,
  generateTransactionNumber,
  generateMaterialTxnNumber,
  syncMaterialInventorySummary,
  syncFinishedGoodsSummary,
} from '@/services/inventory.service';
import { generateInboundOrderNumber, generateShippingOrderNumber } from '@/services/documentNumber.service';
import { logLinesideMovement } from '@/services/linesideMovement.service';
import { withTransaction } from '@/shared/db/withTransaction';
import { syncLineStatus } from '@/services/salesOrderSync.service';

// ==================== Internal Helpers (not exported) ====================

/** Upsert 成品汇总库存表 (finished_goods_inventory) */
const upsertFinishedGoodsInventory = async (
  params: {
    item_number: string; item_name: string; specifications: string; basic_unit: string;
    product_drawing_number: string; warehouse_number: string; warehouse_name: string;
    quality_status: string; deltaQuantity: number;
  },
  transaction?: Transaction
) => {
  const { item_number, item_name, specifications, basic_unit, product_drawing_number,
    warehouse_number, warehouse_name, quality_status, deltaQuantity } = params;

  const [existing]: any = await sequelize.query(
    'SELECT id, quantity FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number AND quality_status = :quality_status',
    { replacements: { item_number, warehouse_number, quality_status }, transaction }
  );

  const beforeQty = existing.length > 0 ? Number(existing[0].quantity) : 0;
  const afterQty = beforeQty + deltaQuantity;

  if (existing.length > 0) {
    await sequelize.query(
      'UPDATE finished_goods_inventory SET quantity = :afterQty, last_updated = GETDATE() WHERE id = :id',
      { replacements: { afterQty, id: existing[0].id }, transaction }
    );
  } else {
    await sequelize.query(
      "INSERT INTO finished_goods_inventory (item_number, item_name, specifications, basic_unit, product_drawing_number, warehouse_number, warehouse_name, quantity, quality_status, last_updated, creation_date) VALUES (:item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quality_status, GETDATE(), GETDATE())",
      { replacements: { item_number, item_name, specifications, basic_unit, product_drawing_number, warehouse_number, warehouse_name, quantity: afterQty, quality_status }, transaction }
    );
  }
  return { beforeQty, afterQty };
};

/** Upsert 物料汇总库存表 (material_inventory) */
const upsertMaterialInventory = async (
  params: {
    item_number: string; item_name: string; item_type: string; specifications: string;
    basic_unit: string; warehouse_number: string; warehouse_name: string; deltaQuantity: number;
  },
  transaction?: Transaction
) => {
  const { item_number, item_name, item_type, specifications, basic_unit,
    warehouse_number, warehouse_name, deltaQuantity } = params;

  const [existing]: any = await sequelize.query(
    'SELECT id, quantity FROM material_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number',
    { replacements: { item_number, warehouse_number }, transaction }
  );

  const beforeQty = existing.length > 0 ? Number(existing[0].quantity) : 0;
  const afterQty = beforeQty + deltaQuantity;

  if (existing.length > 0) {
    await sequelize.query(
      'UPDATE material_inventory SET quantity = :afterQty, last_updated = GETDATE() WHERE id = :id',
      { replacements: { afterQty, id: existing[0].id }, transaction }
    );
  } else {
    await sequelize.query(
      "INSERT INTO material_inventory (item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, last_updated, creation_date) VALUES (:item_number, :item_name, :item_type, :specifications, :basic_unit, :warehouse_number, :warehouse_name, :quantity, GETDATE(), GETDATE())",
      { replacements: { item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity: afterQty }, transaction }
    );
  }
  return { beforeQty, afterQty };
};

/** 插入成品库存流水 (inventory_transaction) */
const createFinishedTransaction = async (
  params: {
    transaction_number: string; transaction_type: string; source_type: string; source_number: string;
    item_number: string; item_name: string; specifications: string; basic_unit: string;
    product_drawing_number: string; warehouse_number: string; warehouse_name: string;
    quantity: number; before_quantity: number; after_quantity: number;
    batch_number: string; operator: string; remark: string; quality_status: string; accounting_period: string;
  },
  transaction?: Transaction
) => {
  await sequelize.query(
    "INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number, item_number, item_name, specifications, basic_unit, product_drawing_number, warehouse_number, warehouse_name, quantity, before_quantity, after_quantity, batch_number, operator, operation_date, remark, quality_status, creation_date, accounting_period) VALUES (:transaction_number, :transaction_type, :source_type, :source_number, :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity, :batch_number, :operator, GETDATE(), :remark, :quality_status, GETDATE(), :accounting_period)",
    { replacements: params, transaction }
  );
};

/** 插入物料库存流水 (material_inventory_transaction) */
const createMaterialTransaction = async (
  params: {
    transaction_number: string; transaction_type: string; source_type: string; source_number: string;
    item_number: string; item_name: string; item_type: string; specifications: string;
    basic_unit: string; warehouse_number: string; warehouse_name: string;
    quantity: number; before_quantity: number; after_quantity: number;
    batch_number: string; supplier_number?: string; supplier_name?: string;
    operator: string; remark: string;
  },
  transaction?: Transaction
) => {
  await sequelize.query(
    "INSERT INTO material_inventory_transaction (transaction_number, transaction_type, source_type, source_number, item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, before_quantity, after_quantity, batch_number, supplier_number, supplier_name, operator, operation_date, remark, creation_date) VALUES (:transaction_number, :transaction_type, :source_type, :source_number, :item_number, :item_name, :item_type, :specifications, :basic_unit, :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity, :batch_number, :supplier_number, :supplier_name, :operator, GETDATE(), :remark, GETDATE())",
    { replacements: params, transaction }
  );
};

/** FIFO 批次扣减 - 支持成品批次和物料批次 */
const fifoDeductBatches = async (
  params: {
    batchTable: 'finished_batch_inventory' | 'material_batch_inventory';
    item_number: string; warehouse_number: string; totalQuantity: number;
    batch_items?: Array<{ batch_number: string; quantity: number }>;
    quality_status?: string;
  },
  transaction: Transaction
): Promise<Array<{ batch_number: string; quantity: number }>> => {
  const { batchTable, item_number, warehouse_number, totalQuantity, batch_items, quality_status } = params;

  let batchDeductions: Array<{ batch_number: string; quantity: number }> = [];

  if (batch_items && Array.isArray(batch_items) && batch_items.length > 0) {
    batchDeductions = batch_items
      .filter(bi => Number(bi.quantity) > 0)
      .map(bi => ({ batch_number: bi.batch_number, quantity: Number(bi.quantity) }));
  } else {
    let fifoWhere = "WHERE item_number = :item_number AND warehouse_number = :warehouse_number AND quantity > 0 AND status = N'正常'";
    const fifoReplacements: any = { item_number, warehouse_number };

    if (quality_status) {
      fifoWhere += " AND quality_status = :quality_status";
      fifoReplacements.quality_status = quality_status;
    }

    const [batches]: any = await sequelize.query(
      "SELECT id, batch_number, quantity FROM " + batchTable + " " + fifoWhere + " ORDER BY inbound_date ASC, id ASC",
      { replacements: fifoReplacements, transaction }
    );

    let remaining = totalQuantity;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const deductQty = Math.min(remaining, Number(batch.quantity));
      batchDeductions.push({ batch_number: batch.batch_number, quantity: deductQty });
      remaining -= deductQty;
    }

    if (remaining > 0) {
      throw new BusinessError(400, "物料 " + item_number + " 批次库存不足，缺少: " + remaining);
    }
  }

  for (const bd of batchDeductions) {
    const [batchRow]: any = await sequelize.query(
      "SELECT id, quantity FROM " + batchTable + " WHERE batch_number = :bn AND item_number = :item_number AND warehouse_number = :warehouse_number",
      { replacements: { bn: bd.batch_number, item_number, warehouse_number }, transaction }
    );

    if (batchRow.length === 0 || Number(batchRow[0].quantity) < bd.quantity) {
      throw new BusinessError(400, "批次 " + bd.batch_number + " 库存不足");
    }

    const newBatchQty = Number(batchRow[0].quantity) - bd.quantity;
    await sequelize.query(
      "UPDATE " + batchTable + " SET quantity = :qty, last_updated = GETDATE() WHERE id = :id",
      { replacements: { qty: newBatchQty, id: batchRow[0].id }, transaction }
    );
  }

  return batchDeductions;
};

/** 写入批次追溯 (batch_traceability) */
const writeBatchTraceability = async (
  params: {
    finishedBatchNumber: string; finishedItemNumber: string; finishedItemName: string;
    productionOrderNumber: string;
  },
  transaction: Transaction
) => {
  const { finishedBatchNumber, finishedItemNumber, finishedItemName, productionOrderNumber } = params;

  const [issueDetails]: any = await sequelize.query(
    "SELECT mid.batch_number, mid.material_number, mid.material_name, mid.actual_quantity, mid.issue_number FROM material_issue_detail mid INNER JOIN material_issue mi ON mid.issue_number = mi.issue_number WHERE mi.production_order_number = :pon AND mid.batch_number != '' AND mid.actual_quantity > 0",
    { replacements: { pon: productionOrderNumber }, transaction }
  );

  for (const detail of issueDetails) {
    await sequelize.query(
      "INSERT INTO batch_traceability (finished_batch_number, finished_item_number, finished_item_name, production_order_number, material_batch_number, material_item_number, material_item_name, material_quantity, issue_number, link_type, creation_date) VALUES (:fbn, :fin, :finame, :pon, :mbn, :min, :miname, :mq, :isn, N'领料', GETDATE())",
      {
        replacements: {
          fbn: finishedBatchNumber, fin: finishedItemNumber, finame: finishedItemName,
          pon: productionOrderNumber,
          mbn: detail.batch_number, min: detail.material_number || '', miname: detail.material_name || '',
          mq: Number(detail.actual_quantity) || 0, isn: detail.issue_number || ''
        }, transaction
      }
    );
  }
};


// ==================== 成品仓 - Main Exported Functions ====================

/** 生产完工入库（成品批次化） */
export const productionInboundFinished = async (
  params: {
    items: Array<{
      item_number: string; item_name?: string; specifications?: string; basic_unit?: string;
      product_drawing_number?: string; inbound_qty: number;
      production_order_number?: string; inbound_quantity?: number; planned_quantity?: number;
    }>;
    warehouse_number: string; warehouse_name: string;
    accounting_period?: string; remark?: string;
  },
  operator: string
) => {
  const b = params;
  if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
    throw new BusinessError(400, '请选择至少一条入库记录');
  }
  if (!b.warehouse_number || !b.warehouse_name) {
    throw new BusinessError(400, '请选择入库仓库');
  }

  const now1 = new Date();
  const defaultAP1 = now1.getFullYear() + '-' + String(now1.getMonth() + 1).padStart(2, '0');
  const accountingPeriod = b.accounting_period || defaultAP1;

  return await withTransaction(async (transaction) => {
    const transactionNumbers: string[] = [];
    const batchNumbers: string[] = [];

    for (const item of b.items) {
      const inboundQty = Number(item.inbound_qty) || 0;
      if (inboundQty <= 0) continue;

      // 1. 自动生成成品批次号
      const batchNo = await generateBatchNumber('FB', transaction);
      batchNumbers.push(batchNo);

      // 2. 写入成品批次库存表
      await sequelize.query(
        "INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit, product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity, production_order_number, inbound_date, status, quality_status, creation_date, last_updated) VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity, :production_order_number, GETDATE(), N'正常', N'合格品', GETDATE(), GETDATE())",
        {
          replacements: {
            batch_number: batchNo,
            item_number: item.item_number, item_name: item.item_name || '',
            specifications: item.specifications || '', basic_unit: item.basic_unit || '',
            product_drawing_number: item.product_drawing_number || '',
            warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
            quantity: inboundQty,
            production_order_number: item.production_order_number || ''
          }, transaction
        }
      );

      // 3. 更新汇总库存表
      const { beforeQty, afterQty } = await upsertFinishedGoodsInventory({
        item_number: item.item_number, item_name: item.item_name || '',
        specifications: item.specifications || '', basic_unit: item.basic_unit || '',
        product_drawing_number: item.product_drawing_number || '',
        warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
        quality_status: '合格品', deltaQuantity: inboundQty,
      }, transaction);

      // 4. 创建流水记录
      const txNum = await generateTransactionNumber(transaction);
      transactionNumbers.push(txNum);

      await createFinishedTransaction({
        transaction_number: txNum, transaction_type: '入库', source_type: '生产入库',
        source_number: item.production_order_number || '',
        item_number: item.item_number, item_name: item.item_name || '',
        specifications: item.specifications || '', basic_unit: item.basic_unit || '',
        product_drawing_number: item.product_drawing_number || '',
        warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
        quantity: inboundQty, before_quantity: beforeQty, after_quantity: afterQty,
        batch_number: batchNo, operator, remark: b.remark || '',
        quality_status: '合格品', accounting_period: accountingPeriod
      }, transaction);

      // 5. 更新生产单入库状态
      const currentInbound = Number(item.inbound_quantity) || 0;
      const totalInbound = currentInbound + inboundQty;
      const plannedQty = Number(item.planned_quantity) || 0;
      const newInboundStatus = totalInbound >= plannedQty ? '全部入库' : '部分入库';

      await sequelize.query(
        'UPDATE production_order SET inbound_quantity = :totalInbound, inbound_status = :status WHERE production_order_number = :pon',
        { replacements: { totalInbound, status: newInboundStatus, pon: item.production_order_number }, transaction }
      );

      // 5.5 线边仓流转：末道工序线边 OUT (can fail silently)
      try {
        const [lastSteps]: any = await sequelize.query(
          'SELECT TOP 1 step_number, work_center_number, work_center_name FROM process_task WHERE production_order_number = :pon ORDER BY step_number DESC',
          { replacements: { pon: item.production_order_number }, transaction }
        );
        if (lastSteps.length > 0) {
          await logLinesideMovement({
            transactionType: '出线边', sourceType: '成品入库', sourceNumber: txNum,
            productionOrderNumber: item.production_order_number || '',
            itemNumber: item.item_number, itemName: item.item_name || '',
            specifications: item.specifications || '', basicUnit: item.basic_unit || '',
            stepNumber: lastSteps[0].step_number,
            workCenterNumber: lastSteps[0].work_center_number || '',
            workCenterName: lastSteps[0].work_center_name || '',
            quantity: inboundQty, direction: 'OUT', operator,
            remark: '成品入库 ' + txNum
          }, transaction);
        }
      } catch (lsErr) {
        console.error('[WIP] logLinesideMovement for inbound error:', lsErr);
      }

      // 6. 写入追溯关联
      await writeBatchTraceability({
        finishedBatchNumber: batchNo, finishedItemNumber: item.item_number,
        finishedItemName: item.item_name || '', productionOrderNumber: item.production_order_number || '',
      }, transaction);
    }

    // ====== 生成生产入库单 ======
    const inboundOrderNo = await generateInboundOrderNumber(transaction);
    let totalQty = 0;
    let lineNum = 0;
    for (let i = 0; i < b.items.length; i++) {
      const item = b.items[i];
      const inboundQty = Number(item.inbound_qty) || 0;
      if (inboundQty <= 0) continue;
      lineNum++;
      totalQty += inboundQty;

      await sequelize.query(
        "INSERT INTO production_inbound_order_detail (inbound_order_number, line_number, production_order_number, item_number, item_name, specifications, basic_unit, product_drawing_number, batch_number, planned_quantity, inbound_quantity, quality_status, transaction_number, remark, creation_date) VALUES (:inbound_order_number, :line_number, :production_order_number, :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :batch_number, :planned_quantity, :inbound_quantity, N'合格品', :transaction_number, :remark, GETDATE())",
        {
          replacements: {
            inbound_order_number: inboundOrderNo, line_number: lineNum,
            production_order_number: item.production_order_number || '',
            item_number: item.item_number, item_name: item.item_name || '',
            specifications: item.specifications || '', basic_unit: item.basic_unit || '',
            product_drawing_number: item.product_drawing_number || '',
            batch_number: batchNumbers[i] || '',
            planned_quantity: Number(item.planned_quantity) || 0,
            inbound_quantity: inboundQty,
            transaction_number: transactionNumbers[i] || '',
            remark: b.remark || ''
          }, transaction
        }
      );
    }

    await sequelize.query(
      'INSERT INTO production_inbound_order (inbound_order_number, warehouse_number, warehouse_name, total_quantity, total_items, remark, accounting_period, operator, inbound_date, creation_date) VALUES (:inbound_order_number, :warehouse_number, :warehouse_name, :total_quantity, :total_items, :remark, :accounting_period, :operator, GETDATE(), GETDATE())',
      {
        replacements: {
          inbound_order_number: inboundOrderNo,
          warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
          total_quantity: totalQty, total_items: lineNum,
          remark: b.remark || '', accounting_period: accountingPeriod, operator
        }, transaction
      }
    );

    return { transactionNumbers, batchNumbers, inboundOrderNumber: inboundOrderNo };
  });
};


/** 发货出库（批次FIFO） - 最复杂的函数，15+ SQL操作跨8张表 */
export const shippingOutbound = async (
  params: {
    items: Array<{
      request_number: string; detail_id?: any;
      item_number: string; item_name?: string; specifications?: string; basic_unit?: string;
      product_drawing_number?: string; ship_quantity: number;
      warehouse_number: string; warehouse_name: string;
      sales_detail_id?: any;
      batch_items?: Array<{ batch_number: string; quantity: number }>;
    }>;
    warehouse_number: string; warehouse_name: string;
    accounting_period?: string; remark?: string;
  },
  operator: string
) => {
  const b = params;
  if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
    throw new BusinessError(400, '请选择至少一条出库记录');
  }
  if (!b.warehouse_number || !b.warehouse_name) {
    throw new BusinessError(400, '请选择出库仓库');
  }

  const now2 = new Date();
  const defaultAP2 = now2.getFullYear() + '-' + String(now2.getMonth() + 1).padStart(2, '0');
  const outboundAP = b.accounting_period || defaultAP2;

  return await withTransaction(async (transaction) => {
    const transactionNumbers: string[] = [];
    const requestNumbers = new Set<string>();
    const shippingOrderItems: { item: any; batchDeductions: { batch_number: string; quantity: number }[] }[] = [];

    for (const item of b.items) {
      const outboundQty = Number(item.ship_quantity) || 0;
      if (outboundQty <= 0) continue;

      requestNumbers.add(item.request_number);

      // FIFO 批次扣减
      const batchDeductions = await fifoDeductBatches({
        batchTable: 'finished_batch_inventory',
        item_number: item.item_number,
        warehouse_number: b.warehouse_number,
        totalQuantity: outboundQty,
        batch_items: item.batch_items,
        quality_status: '合格品',
      }, transaction);

      // 查询汇总表当前量（只查合格品）
      const [summaryRow]: any = await sequelize.query(
        "SELECT id, quantity FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number AND quality_status = N'合格品'",
        { replacements: { item_number: item.item_number, warehouse_number: b.warehouse_number }, transaction }
      );

      if (summaryRow.length === 0) {
        throw new BusinessError(400, '物料 ' + item.item_number + ' (' + item.item_name + ') 在仓库 ' + b.warehouse_name + ' 中无库存记录');
      }

      const beforeQty = Number(summaryRow[0].quantity);
      if (beforeQty < outboundQty) {
        throw new BusinessError(400, '物料 ' + item.item_number + ' (' + item.item_name + ') 库存不足，当前库存: ' + beforeQty + '，需出库: ' + outboundQty);
      }

      const usedBatchNos = batchDeductions.map(bd => bd.batch_number);
      shippingOrderItems.push({ item, batchDeductions });

      // 同步汇总库存表（合格品）
      await syncFinishedGoodsSummary(item.item_number, b.warehouse_number, transaction, '合格品');

      // 创建流水记录
      const txNum = await generateTransactionNumber(transaction);
      transactionNumbers.push(txNum);

      await createFinishedTransaction({
        transaction_number: txNum, transaction_type: '出库', source_type: '发货出库',
        source_number: item.request_number || '',
        item_number: item.item_number, item_name: item.item_name || '',
        specifications: item.specifications || '', basic_unit: item.basic_unit || '',
        product_drawing_number: item.product_drawing_number || '',
        warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
        quantity: outboundQty, before_quantity: beforeQty, after_quantity: beforeQty - outboundQty,
        batch_number: usedBatchNos.join(','),
        operator, remark: b.remark || '',
        quality_status: '合格品', accounting_period: outboundAP
      }, transaction);

      // 更新销售订单明细的已发货数量
      if (item.sales_detail_id) {
        await sequelize.query(
          'UPDATE sales_order_detail SET shipped_quantity = ISNULL(shipped_quantity, 0) + :qty WHERE id = :id',
          { replacements: { qty: outboundQty, id: item.sales_detail_id }, transaction }
        );

        const [detailRow]: any = await sequelize.query(
          'SELECT order_quantity, shipped_quantity FROM sales_order_detail WHERE id = :id',
          { replacements: { id: item.sales_detail_id }, transaction }
        );
        if (detailRow.length > 0) {
          const orderQty = Number(detailRow[0].order_quantity) || 0;
          const shippedQty = Number(detailRow[0].shipped_quantity) || 0;
          let newStatus = '部分发货';
          if (shippedQty >= orderQty) {
            newStatus = shippedQty > orderQty ? '超额发货' : '全部发货';
          }
          await sequelize.query(
            'UPDATE sales_order_detail SET shipping_status = :status WHERE id = :id',
            { replacements: { status: newStatus, id: item.sales_detail_id }, transaction }
          );
          // 同步行状态 + 订单头状态
          await syncLineStatus(item.sales_detail_id, transaction);
        }
      }
    }

    // 更新关联的发货申请状态为“已发货”
    for (const rn of requestNumbers) {
      await sequelize.query(
        "UPDATE shipping_request SET status = N'已发货' WHERE request_number = :rn AND status = N'已审核'",
        { replacements: { rn }, transaction }
      );
    }

    // ========== 自动生成发货单 ==========
    let shippingOrderNumber = '';
    if (shippingOrderItems.length > 0) {
      shippingOrderNumber = await generateShippingOrderNumber();

      // 从第一条发货申请获取客户信息
      const firstRN = shippingOrderItems[0].item.request_number || '';
      let customerNumber = '';
      let customerName = '';
      if (firstRN) {
        const [custRow]: any = await sequelize.query(
          'SELECT customer_number, customer_name FROM shipping_request WHERE request_number = :rn',
          { replacements: { rn: firstRN }, transaction }
        );
        if (custRow.length > 0) {
          customerNumber = custRow[0].customer_number || '';
          customerName = custRow[0].customer_name || '';
        }
      }

      // 插入发货单主表
      await sequelize.query(
        "INSERT INTO shipping_order (shipping_order_number, customer_number, customer_name, warehouse_number, warehouse_name, shipping_date, status, remark, creation_man, creation_date, accounting_period) VALUES (:shipping_order_number, :customer_number, :customer_name, :warehouse_number, :warehouse_name, GETDATE(), N'已发货', :remark, :creation_man, GETDATE(), :accounting_period)",
        {
          replacements: {
            shipping_order_number: shippingOrderNumber,
            customer_number: customerNumber, customer_name: customerName,
            warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
            remark: b.remark || '', creation_man: operator, accounting_period: outboundAP
          }, transaction
        }
      );

      // 插入发货单明细 + 批次明细
      let lineNumber = 0;
      for (const { item, batchDeductions } of shippingOrderItems) {
        lineNumber++;
        const outboundQty = Number(item.ship_quantity) || 0;

        // 查询关联的销售订单号
        let salesOrderNumber = '';
        if (item.request_number && item.sales_detail_id) {
          const [srdRow]: any = await sequelize.query(
            'SELECT sales_order_number FROM shipping_request_detail WHERE request_number = :rn AND sales_detail_id = :sid',
            { replacements: { rn: item.request_number, sid: item.sales_detail_id }, transaction }
          );
          if (srdRow.length > 0) {
            salesOrderNumber = srdRow[0].sales_order_number || '';
          }
        }

        // 插入明细行并获取自增ID (SCOPE_IDENTITY)
        const [insertResult]: any = await sequelize.query(
          "INSERT INTO shipping_order_detail (shipping_order_number, line_number, request_number, sales_order_number, sales_detail_id, item_number, item_name, specifications, basic_unit, product_drawing_number, quantity, remark) VALUES (:shipping_order_number, :line_number, :request_number, :sales_order_number, :sales_detail_id, :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :quantity, :remark); SELECT SCOPE_IDENTITY() AS detail_id;",
          {
            replacements: {
              shipping_order_number: shippingOrderNumber, line_number: lineNumber,
              request_number: item.request_number || '',
              sales_order_number: salesOrderNumber,
              sales_detail_id: item.sales_detail_id || 0,
              item_number: item.item_number, item_name: item.item_name || '',
              specifications: item.specifications || '',
              basic_unit: item.basic_unit || '',
              product_drawing_number: item.product_drawing_number || '',
              quantity: outboundQty, remark: ''
            }, transaction
          }
        );

        const detailId = insertResult[0]?.detail_id || 0;

        // 插入批次明细
        for (const bd of batchDeductions) {
          await sequelize.query(
            'INSERT INTO shipping_order_batch (shipping_order_number, detail_id, item_number, batch_number, quantity) VALUES (:shipping_order_number, :detail_id, :item_number, :batch_number, :quantity)',
            {
              replacements: {
                shipping_order_number: shippingOrderNumber, detail_id: detailId,
                item_number: item.item_number, batch_number: bd.batch_number, quantity: bd.quantity
              }, transaction
            }
          );
        }
      }
    }

    return { transactionNumbers, shippingOrderNumber };
  });
};


/** 退货入库 - 合格品/不合格品分批 */
export const returnInbound = async (
  params: {
    return_order_number: string;
    warehouse_number: string; warehouse_name: string;
    details: Array<{
      item_number: string; item_name?: string; specifications?: string; basic_unit?: string;
      product_drawing_number?: string; return_quantity: number;
      qualified_qty: number; unqualified_qty: number; detail_id?: number;
    }>;
    remark?: string; accounting_period?: string;
  },
  operator: string
) => {
  const b = params;
  const { return_order_number } = b;

  if (!return_order_number) {
    throw new BusinessError(400, '请提供退货单号');
  }
  if (!b.warehouse_number || !b.warehouse_name) {
    throw new BusinessError(400, '请选择入库仓库');
  }
  if (!b.details || !Array.isArray(b.details) || b.details.length === 0) {
    throw new BusinessError(400, '请提供入库明细');
  }

  // 校验退货单状态
  const [headerRows]: any = await sequelize.query(
    'SELECT * FROM return_order WHERE return_order_number = :rn',
    { replacements: { rn: return_order_number } }
  );
  if (headerRows.length === 0) {
    throw new BusinessError(404, '退货单不存在');
  }
  const header = headerRows[0];
  if (header.approval_status !== '已审批') {
    throw new BusinessError(400, '退货单未审批通过，不允许入库操作');
  }
  if (header.inbound_status === '已入库') {
    throw new BusinessError(400, '该退货单已完成入库');
  }

  return await withTransaction(async (transaction) => {
    const transactionNumbers: string[] = [];
    const batchNumbers: string[] = [];
    const detailAgg: Map<number, { qualified: number; unqualified: number }> = new Map();

    for (const detail of b.details) {
      const totalQty = Number(detail.return_quantity) || 0;
      if (totalQty <= 0) continue;

      const qualifiedQty = Number(detail.qualified_qty) || 0;
      const unqualifiedQty = Number(detail.unqualified_qty) || 0;

      if (qualifiedQty < 0 || unqualifiedQty < 0) {
        throw new BusinessError(400, '产品 ' + detail.item_number + ' 的数量不能为负数');
      }
      if (Math.abs(qualifiedQty + unqualifiedQty - totalQty) > 0.001) {
        throw new BusinessError(400, '产品 ' + detail.item_number + ' 的合格品数量(' + qualifiedQty + ') + 不合格品数量(' + unqualifiedQty + ') 不等于退货数量(' + totalQty + ')');
      }

      const subEntries: Array<{ qualityStatus: string; quantity: number }> = [];
      if (qualifiedQty > 0) subEntries.push({ qualityStatus: '合格品', quantity: qualifiedQty });
      if (unqualifiedQty > 0) subEntries.push({ qualityStatus: '不合格品', quantity: unqualifiedQty });

      for (const entry of subEntries) {
        // 1. 生成成品批次号
        const batchNo = await generateBatchNumber('FB', transaction);
        batchNumbers.push(batchNo);

        // 2. 写入成品批次库存
        await sequelize.query(
          "INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit, product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity, return_order_number, inbound_date, status, quality_status, creation_date, last_updated) VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity, :return_order_number, GETDATE(), N'正常', :quality_status, GETDATE(), GETDATE())",
          {
            replacements: {
              batch_number: batchNo,
              item_number: detail.item_number, item_name: detail.item_name || '',
              specifications: detail.specifications || '', basic_unit: detail.basic_unit || '',
              product_drawing_number: detail.product_drawing_number || '',
              warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
              quantity: entry.quantity,
              return_order_number: return_order_number,
              quality_status: entry.qualityStatus
            }, transaction
          }
        );

        // 3. 更新汇总库存（按质量状态维度）
        const { beforeQty, afterQty } = await upsertFinishedGoodsInventory({
          item_number: detail.item_number, item_name: detail.item_name || '',
          specifications: detail.specifications || '', basic_unit: detail.basic_unit || '',
          product_drawing_number: detail.product_drawing_number || '',
          warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
          quality_status: entry.qualityStatus, deltaQuantity: entry.quantity,
        }, transaction);

        // 4. 创建库存流水
        const txNum = await generateTransactionNumber(transaction);
        transactionNumbers.push(txNum);

        await createFinishedTransaction({
          transaction_number: txNum, transaction_type: '入库', source_type: '退货入库',
          source_number: return_order_number,
          item_number: detail.item_number, item_name: detail.item_name || '',
          specifications: detail.specifications || '', basic_unit: detail.basic_unit || '',
          product_drawing_number: detail.product_drawing_number || '',
          warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
          quantity: entry.quantity, before_quantity: beforeQty, after_quantity: afterQty,
          batch_number: batchNo, operator, remark: b.remark || '退货入库',
          quality_status: entry.qualityStatus,
          accounting_period: b.accounting_period || new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')
        }, transaction);
      }

      // 5. 汇总 detail_id 的合格品/不合格品数量
      if (detail.detail_id) {
        const agg = detailAgg.get(detail.detail_id) || { qualified: 0, unqualified: 0 };
        agg.qualified += qualifiedQty;
        agg.unqualified += unqualifiedQty;
        detailAgg.set(detail.detail_id, agg);
      }
    }

    // 5b. 批量更新退货单明细的质量状态和拆分数量
    for (const [detailId, agg] of detailAgg.entries()) {
      const displayStatus = agg.qualified > 0 && agg.unqualified > 0 ? '混合' : (agg.qualified > 0 ? '合格品' : '不合格品');
      await sequelize.query(
        'UPDATE return_order_detail SET quality_status = :quality_status, qualified_qty = :qualified_qty, unqualified_qty = :unqualified_qty WHERE id = :id',
        { replacements: { quality_status: displayStatus, qualified_qty: agg.qualified, unqualified_qty: agg.unqualified, id: detailId }, transaction }
      );
    }

    // 6. 更新退货单入库状态
    await sequelize.query(
      "UPDATE return_order SET inbound_status = N'已入库' WHERE return_order_number = :rn",
      { replacements: { rn: return_order_number }, transaction }
    );

    return { transactionNumbers, batchNumbers };
  });
};

/** 成品库存手动调整 */
export const adjustFinishedInventory = async (
  params: {
    item_number: string; item_name?: string; specifications?: string; basic_unit?: string;
    product_drawing_number?: string; warehouse_number: string; warehouse_name?: string;
    adjust_quantity: number; quality_status?: string; remark?: string; accounting_period?: string;
  },
  operator: string
) => {
  const b = params;
  if (!b.item_number || !b.warehouse_number || b.adjust_quantity === undefined) {
    throw new BusinessError(400, '请填写完整的调整信息');
  }

  const adjustQty = Number(b.adjust_quantity);
  if (adjustQty === 0) {
    throw new BusinessError(400, '调整数量不能为0');
  }

  const qualityStatus = b.quality_status || '合格品';

  return await withTransaction(async (transaction) => {
    const [existing]: any = await sequelize.query(
      "SELECT id, quantity FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number AND quality_status = :quality_status",
      { replacements: { item_number: b.item_number, warehouse_number: b.warehouse_number, quality_status: qualityStatus }, transaction }
    );

    const beforeQty = existing.length > 0 ? Number(existing[0].quantity) : 0;
    const afterQty = beforeQty + adjustQty;

    if (afterQty < 0) {
      throw new BusinessError(400, '调整后库存不能为负数，当前库存: ' + beforeQty);
    }

    if (existing.length > 0) {
      await sequelize.query(
        'UPDATE finished_goods_inventory SET quantity = :afterQty, last_updated = GETDATE() WHERE id = :id',
        { replacements: { afterQty, id: existing[0].id }, transaction }
      );
    } else {
      await sequelize.query(
        "INSERT INTO finished_goods_inventory (item_number, item_name, specifications, basic_unit, product_drawing_number, warehouse_number, warehouse_name, quantity, quality_status, last_updated, creation_date) VALUES (:item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quality_status, GETDATE(), GETDATE())",
        {
          replacements: {
            item_number: b.item_number, item_name: b.item_name || '',
            specifications: b.specifications || '', basic_unit: b.basic_unit || '',
            product_drawing_number: b.product_drawing_number || '',
            warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name || '',
            quantity: afterQty, quality_status: qualityStatus
          }, transaction
        }
      );
    }

    const txNum = await generateTransactionNumber(transaction);
    const txType = adjustQty > 0 ? '入库' : '出库';

    await createFinishedTransaction({
      transaction_number: txNum, transaction_type: txType,
      source_type: '手动调整', source_number: '',
      item_number: b.item_number, item_name: b.item_name || '',
      specifications: b.specifications || '', basic_unit: b.basic_unit || '',
      product_drawing_number: b.product_drawing_number || '',
      warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name || '',
      quantity: Math.abs(adjustQty), before_quantity: beforeQty, after_quantity: afterQty,
      batch_number: '', operator, remark: b.remark || '手动调整',
      quality_status: qualityStatus,
      accounting_period: b.accounting_period || new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')
    }, transaction);

    return { transaction_number: txNum };
  });
};


// ==================== 物料仓 - Main Exported Functions ====================

/** 原材料手工入库 */
export const manualInboundMaterial = async (
  params: {
    items: Array<{
      item_number: string; item_name?: string; item_type?: string;
      specifications?: string; basic_unit?: string; quantity: number;
      supplier_number?: string; supplier_name?: string;
    }>;
    warehouse_number: string; warehouse_name: string; remark?: string;
  },
  operator: string
) => {
  const b = params;
  if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
    throw new BusinessError(400, '请添加至少一条入库记录');
  }
  if (!b.warehouse_number || !b.warehouse_name) {
    throw new BusinessError(400, '请选择入库仓库');
  }

  return await withTransaction(async (transaction) => {
    const transactionNumbers: string[] = [];
    const batchNumbers: string[] = [];

    for (const item of b.items) {
      const inboundQty = Number(item.quantity) || 0;
      if (inboundQty <= 0) continue;

      // 1. 自动生成批次号
      const batchNo = await generateBatchNumber('MB', transaction);
      batchNumbers.push(batchNo);

      // 2. 写入批次库存表
      await sequelize.query(
        "INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity, supplier_number, supplier_name, inbound_date, status, creation_date, last_updated) VALUES (:batch_number, :item_number, :item_name, :item_type, :specifications, :basic_unit, :warehouse_number, :warehouse_name, :quantity, :quantity, :supplier_number, :supplier_name, GETDATE(), N'正常', GETDATE(), GETDATE())",
        {
          replacements: {
            batch_number: batchNo,
            item_number: item.item_number, item_name: item.item_name || '',
            item_type: item.item_type || '原材料',
            specifications: item.specifications || '', basic_unit: item.basic_unit || '',
            warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
            quantity: inboundQty,
            supplier_number: item.supplier_number || '', supplier_name: item.supplier_name || ''
          }, transaction
        }
      );

      // 3. 更新汇总库存表 (material_inventory)
      const { beforeQty, afterQty } = await upsertMaterialInventory({
        item_number: item.item_number, item_name: item.item_name || '',
        item_type: item.item_type || '原材料',
        specifications: item.specifications || '', basic_unit: item.basic_unit || '',
        warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
        deltaQuantity: inboundQty,
      }, transaction);

      // 4. 记录流水
      const txNum = await generateMaterialTxnNumber();
      transactionNumbers.push(txNum);

      await createMaterialTransaction({
        transaction_number: txNum, transaction_type: '入库', source_type: '采购入库',
        source_number: '',
        item_number: item.item_number, item_name: item.item_name || '',
        item_type: item.item_type || '原材料',
        specifications: item.specifications || '', basic_unit: item.basic_unit || '',
        warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
        quantity: inboundQty, before_quantity: beforeQty, after_quantity: afterQty,
        batch_number: batchNo,
        supplier_number: item.supplier_number || '', supplier_name: item.supplier_name || '',
        operator, remark: b.remark || ''
      }, transaction);
    }

    return { transactionNumbers, batchNumbers };
  });
};

/** 半成品生产完工入库 */
export const productionInboundMaterial = async (
  params: {
    items: Array<{
      item_number: string; item_name?: string; specifications?: string; basic_unit?: string;
      inbound_qty: number; production_order_number?: string;
      inbound_quantity?: number; planned_quantity?: number;
    }>;
    warehouse_number: string; warehouse_name: string; remark?: string;
  },
  operator: string
) => {
  const b = params;
  if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
    throw new BusinessError(400, '请选择至少一条入库记录');
  }
  if (!b.warehouse_number || !b.warehouse_name) {
    throw new BusinessError(400, '请选择入库仓库');
  }

  return await withTransaction(async (transaction) => {
    const transactionNumbers: string[] = [];
    const batchNumbers: string[] = [];

    for (const item of b.items) {
      const inboundQty = Number(item.inbound_qty) || 0;
      if (inboundQty <= 0) continue;

      // 1. 自动生成半成品批次号
      const batchNo = await generateBatchNumber('HB', transaction);
      batchNumbers.push(batchNo);

      // 2. 写入批次库存表
      await sequelize.query(
        "INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity, production_order_number, inbound_date, status, creation_date, last_updated) VALUES (:batch_number, :item_number, :item_name, N'半成品', :specifications, :basic_unit, :warehouse_number, :warehouse_name, :quantity, :quantity, :production_order_number, GETDATE(), N'正常', GETDATE(), GETDATE())",
        {
          replacements: {
            batch_number: batchNo,
            item_number: item.item_number, item_name: item.item_name || '',
            specifications: item.specifications || '', basic_unit: item.basic_unit || '',
            warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
            quantity: inboundQty,
            production_order_number: item.production_order_number || ''
          }, transaction
        }
      );

      // 3. 更新汇总库存表
      const { beforeQty, afterQty } = await upsertMaterialInventory({
        item_number: item.item_number, item_name: item.item_name || '',
        item_type: '半成品',
        specifications: item.specifications || '', basic_unit: item.basic_unit || '',
        warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
        deltaQuantity: inboundQty,
      }, transaction);

      // 4. 记录流水（含批次号）
      const txNum = await generateMaterialTxnNumber();
      transactionNumbers.push(txNum);

      await createMaterialTransaction({
        transaction_number: txNum, transaction_type: '入库', source_type: '生产入库',
        source_number: item.production_order_number || '',
        item_number: item.item_number, item_name: item.item_name || '',
        item_type: '半成品',
        specifications: item.specifications || '', basic_unit: item.basic_unit || '',
        warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
        quantity: inboundQty, before_quantity: beforeQty, after_quantity: afterQty,
        batch_number: batchNo,
        supplier_number: '', supplier_name: '',
        operator, remark: b.remark || ''
      }, transaction);

      // 5. 更新生产单入库状态
      const currentInbound = Number(item.inbound_quantity) || 0;
      const totalInbound = currentInbound + inboundQty;
      const plannedQty = Number(item.planned_quantity) || 0;
      const newInboundStatus = totalInbound >= plannedQty ? '全部入库' : '部分入库';

      await sequelize.query(
        'UPDATE production_order SET inbound_quantity = :totalInbound, inbound_status = :status WHERE production_order_number = :pon',
        { replacements: { totalInbound, status: newInboundStatus, pon: item.production_order_number }, transaction }
      );

      // 6. 写入追溯关联（半成品入库时，反查该生产单的领料批次）
      await writeBatchTraceability({
        finishedBatchNumber: batchNo, finishedItemNumber: item.item_number,
        finishedItemName: item.item_name || '', productionOrderNumber: item.production_order_number || '',
      }, transaction);
    }

    return { transactionNumbers, batchNumbers };
  });
};


/** 手工出库（物料批次FIFO） */
export const manualOutboundMaterial = async (
  params: {
    item_number: string; warehouse_number: string; quantity: number;
    batch_items?: Array<{ batch_number: string; quantity: number }>; remark?: string;
  },
  operator: string
) => {
  const b = params;
  if (!b.item_number || !b.warehouse_number) {
    throw new BusinessError(400, '请选择物料和仓库');
  }
  const outQty = Number(b.quantity) || 0;
  if (outQty <= 0) {
    throw new BusinessError(400, '出库数量必须大于0');
  }

  return await withTransaction(async (transaction) => {
    // 汇总表验证
    const [existing]: any = await sequelize.query(
      'SELECT id, quantity, item_name, item_type, specifications, basic_unit, warehouse_name FROM material_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number',
      { replacements: { item_number: b.item_number, warehouse_number: b.warehouse_number }, transaction }
    );

    if (existing.length === 0) {
      throw new BusinessError(400, '物料 ' + b.item_number + ' 在仓库 ' + b.warehouse_number + ' 中无库存记录');
    }

    const summaryBeforeQty = Number(existing[0].quantity);
    if (summaryBeforeQty < outQty) {
      throw new BusinessError(400, '库存不足，当前库存: ' + summaryBeforeQty + '，需出库: ' + outQty);
    }

    // FIFO 批次扣减
    const batchDeductions = await fifoDeductBatches({
      batchTable: 'material_batch_inventory',
      item_number: b.item_number,
      warehouse_number: b.warehouse_number,
      totalQuantity: outQty,
      batch_items: b.batch_items,
    }, transaction);

    // 按批次记录流水
    const txNumbers: string[] = [];
    for (const bd of batchDeductions) {
      const [batchRow]: any = await sequelize.query(
        'SELECT id, quantity FROM material_batch_inventory WHERE batch_number = :bn AND item_number = :in AND warehouse_number = :wn',
        { replacements: { bn: bd.batch_number, in: b.item_number, wn: b.warehouse_number }, transaction }
      );
      if (batchRow.length === 0 || Number(batchRow[0].quantity) < bd.quantity) {
        throw new BusinessError(400, '批次 ' + bd.batch_number + ' 库存不足');
      }

      const batchBefore = Number(batchRow[0].quantity);
      const batchAfter = batchBefore - bd.quantity;
      await sequelize.query(
        'UPDATE material_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id',
        { replacements: { qty: batchAfter, id: batchRow[0].id }, transaction }
      );

      // 记录流水（每个批次一条）
      const txNum = await generateMaterialTxnNumber();
      txNumbers.push(txNum);

      await createMaterialTransaction({
        transaction_number: txNum, transaction_type: '出库', source_type: '手动出库',
        source_number: '',
        item_number: b.item_number, item_name: existing[0].item_name || '',
        item_type: existing[0].item_type || '',
        specifications: existing[0].specifications || '', basic_unit: existing[0].basic_unit || '',
        warehouse_number: b.warehouse_number, warehouse_name: existing[0].warehouse_name || '',
        quantity: bd.quantity, before_quantity: batchBefore, after_quantity: batchAfter,
        batch_number: bd.batch_number,
        supplier_number: '', supplier_name: '',
        operator, remark: b.remark || ''
      }, transaction);
    }

    // 同步汇总表
    await syncMaterialInventorySummary(b.item_number, b.warehouse_number, transaction);

    return { transaction_numbers: txNumbers };
  });
};

/** 物料库存手动调整 */
export const adjustMaterialInventory = async (
  params: {
    item_number: string; item_name?: string; item_type?: string;
    specifications?: string; basic_unit?: string;
    warehouse_number: string; warehouse_name?: string;
    adjust_quantity: number; remark?: string;
  },
  operator: string
) => {
  const b = params;
  if (!b.item_number || !b.warehouse_number || b.adjust_quantity === undefined) {
    throw new BusinessError(400, '请填写完整的调整信息');
  }

  const adjustQty = Number(b.adjust_quantity);
  if (adjustQty === 0) {
    throw new BusinessError(400, '调整数量不能为0');
  }

  return await withTransaction(async (transaction) => {
    const [existing]: any = await sequelize.query(
      'SELECT id, quantity, item_name, item_type, specifications, basic_unit, warehouse_name FROM material_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number',
      { replacements: { item_number: b.item_number, warehouse_number: b.warehouse_number }, transaction }
    );

    const beforeQty = existing.length > 0 ? Number(existing[0].quantity) : 0;
    const afterQty = beforeQty + adjustQty;

    if (afterQty < 0) {
      throw new BusinessError(400, '调整后库存不能为负数，当前库存: ' + beforeQty);
    }

    if (existing.length > 0) {
      await sequelize.query(
        'UPDATE material_inventory SET quantity = :afterQty, last_updated = GETDATE() WHERE id = :id',
        { replacements: { afterQty, id: existing[0].id }, transaction }
      );
    } else {
      await sequelize.query(
        "INSERT INTO material_inventory (item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, last_updated, creation_date) VALUES (:item_number, :item_name, :item_type, :specifications, :basic_unit, :warehouse_number, :warehouse_name, :quantity, GETDATE(), GETDATE())",
        {
          replacements: {
            item_number: b.item_number, item_name: b.item_name || '',
            item_type: b.item_type || '', specifications: b.specifications || '',
            basic_unit: b.basic_unit || '',
            warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name || '',
            quantity: afterQty
          }, transaction
        }
      );
    }

    const txNum = await generateMaterialTxnNumber();
    const txType = adjustQty > 0 ? '入库' : '出库';

    await createMaterialTransaction({
      transaction_number: txNum, transaction_type: txType,
      source_type: '手动调整', source_number: '',
      item_number: b.item_number, item_name: b.item_name || existing[0]?.item_name || '',
      item_type: b.item_type || existing[0]?.item_type || '',
      specifications: b.specifications || existing[0]?.specifications || '',
      basic_unit: b.basic_unit || existing[0]?.basic_unit || '',
      warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name || existing[0]?.warehouse_name || '',
      quantity: Math.abs(adjustQty), before_quantity: beforeQty, after_quantity: afterQty,
      batch_number: '', supplier_number: '', supplier_name: '',
      operator, remark: b.remark || '手动调整'
    }, transaction);

    return { transaction_number: txNum };
  });
};
