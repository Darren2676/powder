/**
 * 仓库服务 - 成品仓业务逻辑
 * 从 warehouse.service.ts 拆分
 */
import sequelize from '@/config/database';
import { BusinessError } from '@/shared/errors/BusinessError';
import {
  generateBatchNumber,
  generateTransactionNumber,
  syncFinishedGoodsSummary,
} from '@/services/inventory.service';
import { generateInboundOrderNumber, generateShippingOrderNumber } from '@/services/documentNumber.service';
import { logLinesideMovement } from '@/services/linesideMovement.service';
import { withTransaction } from '@/shared/db/withTransaction';
import { syncLineStatus } from '@/services/salesOrderSync.service';
import { checkAndAutoComplete } from '@/services/documentAutoComplete.service';
import { executeBackflushDeduction } from '@/services/backflushTask.service';
import { upsertFinishedGoodsInventory, createFinishedTransaction, fifoDeductBatches, writeBatchTraceability, createTransactionBatches, validateAccountingPeriodOpen } from './helpers';
import { createLogger } from '@/config/logger';
import { recalcYieldRate } from '../productionYield.service';

const log = createLogger('warehouse-finished');

// ==================== 成品仓 - Main Exported Functions ====================

/** 生产完工入库（成品批次化） */
export const productionInboundFinished = async (
  params: {
    items: Array<{
      item_number: string; item_name?: string; specifications?: string; basic_unit?: string;
      product_drawing_number?: string; inbound_qty: number;
      production_order_number?: string; inbound_quantity?: number; planned_quantity?: number;
      production_date?: string;
    }>;
    warehouse_number: string; warehouse_name: string;
    accounting_period?: string; remark?: string;
  },
  operator: string,
  factoryCode: string = '',
  _factoryId: number | null = null
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
  await validateAccountingPeriodOpen(accountingPeriod);

  return await withTransaction(async (transaction) => {
    const transactionNumbers: string[] = [];
    const batchNumbers: string[] = [];

    for (const item of b.items) {
      const inboundQty = Number(item.inbound_qty) || 0;
      if (inboundQty <= 0) continue;

      // 1. 自动生成成品批次号
      const batchNo = await generateBatchNumber('FB', factoryCode, transaction);
      batchNumbers.push(batchNo);

      // 2. 写入成品批次库存表
      await sequelize.query(
        "INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit, product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity, production_order_number, inbound_date, production_date, status, quality_status, creation_date, last_updated, factory_id) VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity, :production_order_number, GETDATE(), :production_date, N'正常', N'合格品', GETDATE(), GETDATE(), :factory_id)",
        {
          replacements: {
            batch_number: batchNo,
            item_number: item.item_number, item_name: item.item_name || '',
            specifications: item.specifications || '', basic_unit: item.basic_unit || '',
            product_drawing_number: item.product_drawing_number || '',
            warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
            quantity: inboundQty,
            production_order_number: item.production_order_number || '',
            production_date: item.production_date || null,
            factory_id: _factoryId
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
      const txNum = await generateTransactionNumber(factoryCode, transaction);
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
        quality_status: '合格品', accounting_period: accountingPeriod,
        factory_id: _factoryId
      }, transaction);

      // 5. 更新生产单入库状态（以末道报工正品数为基准，而非计划数量）
      const currentInbound = Number(item.inbound_quantity) || 0;
      const totalInbound = currentInbound + inboundQty;
      // 查询末道报工正品数
      const [lastStepResult]: any = await sequelize.query(
        `SELECT ISNULL(SUM(ISNULL(qualified_quantity, 0)), 0) as last_qualified FROM work_report WHERE production_order_number = :pon AND step_number = (SELECT MAX(step_number) FROM work_report WHERE production_order_number = :pon)`,
        { replacements: { pon: item.production_order_number }, transaction }
      );
      const lastStepQualified = Number(lastStepResult[0]?.last_qualified) || Number(item.planned_quantity) || 0;
      const newInboundStatus = totalInbound >= lastStepQualified ? '全部入库' : '部分入库';

      await sequelize.query(
        'UPDATE production_order SET inbound_quantity = :totalInbound, inbound_status = :status WHERE production_order_number = :pon',
        { replacements: { totalInbound, status: newInboundStatus, pon: item.production_order_number }, transaction }
      );

      // 尝试自动完成（需同时满足生产完成+入库完成）
      if (item.production_order_number) {
        await checkAndAutoComplete('production_order', item.production_order_number, transaction);
      }

      // 重算生产单综合合格率（入库量变化）
      if (item.production_order_number) {
        await recalcYieldRate(item.production_order_number, transaction);
      }

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
          }, transaction, factoryCode);
        }
      } catch (lsErr) {
        log.error({ lsErr, itemNumber: item.item_number, productionOrderNumber: item.production_order_number }, '线边仓流转记录失败');
      }

      // 5.6 倒冲扣减：成品入库时自动扣减倒冲物料库存（扣减失败则阻止入库，保证账务平衡）
      if (item.production_order_number) {
        await executeBackflushDeduction(item.production_order_number, inboundQty, operator, transaction, factoryCode);
      }

      // 6. 写入追溯关联
      await writeBatchTraceability({
        finishedBatchNumber: batchNo, finishedItemNumber: item.item_number,
        finishedItemName: item.item_name || '', productionOrderNumber: item.production_order_number || '',
      }, transaction);
    }

    // ====== 生成生产入库单 ======
    const inboundOrderNo = await generateInboundOrderNumber(factoryCode, transaction);
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
      'INSERT INTO production_inbound_order (inbound_order_number, warehouse_number, warehouse_name, total_quantity, total_items, remark, accounting_period, operator, inbound_date, creation_date, factory_id) VALUES (:inbound_order_number, :warehouse_number, :warehouse_name, :total_quantity, :total_items, :remark, :accounting_period, :operator, GETDATE(), GETDATE(), :factory_id)',
      {
        replacements: {
          inbound_order_number: inboundOrderNo,
          warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
          total_quantity: totalQty, total_items: lineNum,
          remark: b.remark || '', accounting_period: accountingPeriod, operator,
          factory_id: _factoryId
        }, transaction
      }
    );

    return { transactionNumbers, batchNumbers, inboundOrderNumber: inboundOrderNo };
  });
};


/** 发货出库（批次FIFO / 扫箱码双模式） */
export const shippingOutbound = async (
  params: {
    items: Array<{
      request_number: string; detail_id?: any;
      item_number: string; item_name?: string; specifications?: string; basic_unit?: string;
      product_drawing_number?: string; ship_quantity: number;
      warehouse_number: string; warehouse_name: string;
      sales_detail_id?: any;
      batch_items?: Array<{ batch_number: string; quantity: number }>;
      box_numbers?: string[];  // 扫箱码出库：指定箱号列表
    }>;
    warehouse_number: string; warehouse_name: string;
    accounting_period?: string; remark?: string;
  },
  operator: string,
  factoryCode: string = '',
  _factoryId: number | null = null
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
  await validateAccountingPeriodOpen(outboundAP);

  return await withTransaction(async (transaction) => {
    const transactionNumbers: string[] = [];
    const requestNumbers = new Set<string>();
    const shippingOrderItems: { item: any; batchDeductions: { batch_number: string; quantity: number }[] }[] = [];

    // 提前生成发货单号，用于写入 inventory_transaction.shipping_order_number
    const shippingOrderNumber = await generateShippingOrderNumber();

    for (const item of b.items) {
      const outboundQty = Number(item.ship_quantity) || 0;
      if (outboundQty <= 0 && !item.box_numbers?.length) continue;

      requestNumbers.add(item.request_number);

      // ========== 扫箱码出库模式 ==========
      if (item.box_numbers && item.box_numbers.length > 0) {
        for (const boxNumber of item.box_numbers) {
          // 查询箱装库存
          const [boxInvRows]: any = await sequelize.query(
            `SELECT * FROM packing_box_inventory WHERE box_number = :bn AND warehouse_number = :wn`,
            { replacements: { bn: boxNumber, wn: b.warehouse_number }, transaction }
          );
          if (boxInvRows.length === 0) {
            throw new BusinessError(400, `箱号 ${boxNumber} 在仓库中不存在`);
          }
          const boxInv = boxInvRows[0];
          if (boxInv.status === '已出库') {
            throw new BusinessError(400, `箱号 ${boxNumber} 已出库，不能重复出库`);
          }

          // 更新箱装库存状态
          await sequelize.query(
            `UPDATE packing_box_inventory SET status = N'已出库', outbound_date = GETDATE(), last_updated = GETDATE() WHERE box_number = :bn`,
            { replacements: { bn: boxNumber }, transaction }
          );
          // 同步 packing_box
          await sequelize.query(
            `UPDATE packing_box SET status = N'已出库' WHERE box_number = :bn`,
            { replacements: { bn: boxNumber }, transaction }
          );

          const boxQty = Number(boxInv.total_quantity);
          // 汇总库存
          const [summaryRow]: any = await sequelize.query(
            "SELECT id, quantity FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number AND quality_status = N'合格品'",
            { replacements: { item_number: boxInv.item_number, warehouse_number: b.warehouse_number }, transaction }
          );
          const beforeQty = summaryRow.length > 0 ? Number(summaryRow[0].quantity) : 0;
          const afterQty = beforeQty - boxQty;

          if (summaryRow.length > 0) {
            await sequelize.query(
              'UPDATE finished_goods_inventory SET quantity = :afterQty, last_updated = GETDATE() WHERE id = :id',
              { replacements: { afterQty, id: summaryRow[0].id }, transaction }
            );
          }

          // 库存流水
          const txNum = await generateTransactionNumber(factoryCode, transaction);
          transactionNumbers.push(txNum);

          const [boxLabels]: any = await sequelize.query(
            `SELECT batch_number, SUM(label_quantity) as quantity FROM packing_bag_label WHERE box_number = :bn GROUP BY batch_number`,
            { replacements: { bn: boxNumber }, transaction }
          );
          const primaryBatch = boxLabels.length > 0 ? boxLabels[0].batch_number : (boxInv.batch_numbers || '').split(',')[0] || '';

          await createFinishedTransaction({
            transaction_number: txNum, transaction_type: '出库', source_type: '发货出库(箱)',
            source_number: (item.request_number || boxNumber).substring(0, 50),
            item_number: boxInv.item_number, item_name: (boxInv.item_name || '').substring(0, 200),
            specifications: (boxInv.specifications || '').substring(0, 200), basic_unit: (boxInv.basic_unit || '').substring(0, 50),
            product_drawing_number: '',
            warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
            quantity: boxQty, before_quantity: beforeQty, after_quantity: afterQty,
            batch_number: primaryBatch,
            operator, remark: (b.remark || '').substring(0, 500),
            quality_status: '合格品', accounting_period: outboundAP,
            shipping_order_number: shippingOrderNumber
          }, transaction);

          // 批次明细
          const batchDeductions = boxLabels.map((bl: any) => ({ batch_number: bl.batch_number, quantity: Number(bl.quantity) }));
          await createTransactionBatches(txNum, batchDeductions, transaction);
          shippingOrderItems.push({ item: { ...item, item_number: boxInv.item_number, ship_quantity: boxQty }, batchDeductions });
        }

        // 同步汇总
        await syncFinishedGoodsSummary(item.item_number, b.warehouse_number, transaction, '合格品');
        continue;  // 跳过下面的FIFO逻辑
      }

      // ========== 散装批次FIFO出库模式（原有逻辑） ==========
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
      const txNum = await generateTransactionNumber(factoryCode, transaction);
      transactionNumbers.push(txNum);

      await createFinishedTransaction({
        transaction_number: txNum, transaction_type: '出库', source_type: '发货出库',
        source_number: (item.request_number || '').substring(0, 50),
        item_number: item.item_number, item_name: (item.item_name || '').substring(0, 200),
        specifications: (item.specifications || '').substring(0, 200), basic_unit: (item.basic_unit || '').substring(0, 50),
        product_drawing_number: (item.product_drawing_number || '').substring(0, 100),
        warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
        quantity: outboundQty, before_quantity: beforeQty, after_quantity: beforeQty - outboundQty,
        batch_number: usedBatchNos[0] || '',
        operator, remark: (b.remark || '').substring(0, 500),
        quality_status: '合格品', accounting_period: outboundAP,
        shipping_order_number: shippingOrderNumber
      }, transaction);

      // 写入批次明细到扩展表
      await createTransactionBatches(txNum, batchDeductions, transaction);

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

      // 更新发货申请明细的已发数量
      if (item.request_number && item.sales_detail_id) {
        await sequelize.query(
          'UPDATE shipping_request_detail SET shipped_quantity = ISNULL(shipped_quantity, 0) + :qty WHERE request_number = :rn AND sales_detail_id = :sid',
          { replacements: { qty: outboundQty, rn: item.request_number, sid: item.sales_detail_id }, transaction }
        );
      }
    }

    // 更新关联的发货申请状态为"已发货"
    for (const rn of requestNumbers) {
      await sequelize.query(
        "UPDATE shipping_request SET status = N'已发货' WHERE request_number = :rn AND status = N'已审核'",
        { replacements: { rn }, transaction }
      );
    }

    // ========== 自动生成发货单 ==========
    if (shippingOrderItems.length > 0) {

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
        "INSERT INTO shipping_order (shipping_order_number, customer_number, customer_name, warehouse_number, warehouse_name, shipping_date, status, remark, creation_man, creation_date, accounting_period, factory_id) VALUES (:shipping_order_number, :customer_number, :customer_name, :warehouse_number, :warehouse_name, GETDATE(), N'已发货', :remark, :creation_man, GETDATE(), :accounting_period, :factory_id)",
        {
          replacements: {
            shipping_order_number: shippingOrderNumber,
            customer_number: customerNumber, customer_name: customerName,
            warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
            remark: b.remark || '', creation_man: operator, accounting_period: outboundAP,
            factory_id: _factoryId
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
              product_drawing_number: (item.product_drawing_number || '').substring(0, 100),
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
  operator: string,
  factoryCode: string = '',
  _factoryId: number | null = null
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

  // 校验会计期间
  const returnAP = b.accounting_period || new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  await validateAccountingPeriodOpen(returnAP);

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
        const batchNo = await generateBatchNumber('FB', factoryCode, transaction);
        batchNumbers.push(batchNo);

        // 2. 写入成品批次库存
        await sequelize.query(
          "INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit, product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity, return_order_number, inbound_date, status, quality_status, creation_date, last_updated, factory_id) VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity, :return_order_number, GETDATE(), N'正常', :quality_status, GETDATE(), GETDATE(), :factory_id)",
          {
            replacements: {
              batch_number: batchNo,
              item_number: detail.item_number, item_name: detail.item_name || '',
              specifications: detail.specifications || '', basic_unit: detail.basic_unit || '',
              product_drawing_number: detail.product_drawing_number || '',
              warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
              quantity: entry.quantity,
              return_order_number: return_order_number,
              quality_status: entry.qualityStatus,
              factory_id: _factoryId
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
        const txNum = await generateTransactionNumber(factoryCode, transaction);
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
          accounting_period: returnAP
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

    // 6. 更新退货单入库状态及单据状态
    await sequelize.query(
      "UPDATE return_order SET inbound_status = N'已入库', status = N'已确认' WHERE return_order_number = :rn",
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
  operator: string,
  factoryCode: string = ''
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
  const adjustAP = b.accounting_period || new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  await validateAccountingPeriodOpen(adjustAP);

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

    const txNum = await generateTransactionNumber(factoryCode, transaction);
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
      accounting_period: adjustAP
    }, transaction);

    return { transaction_number: txNum };
  });
};

// ==================== 发货出库撤回（仅最近一次） ====================
export const rollbackShippingOutbound = async (
  request_number: string,
  operator: string
) => {
  if (!request_number) {
    throw new BusinessError(400, '请提供发货申请编号');
  }

  return await withTransaction(async (transaction) => {
    // 1. 校验发货申请状态
    const [reqRows]: any = await sequelize.query(
      "SELECT * FROM shipping_request WHERE request_number = :rn",
      { replacements: { rn: request_number }, transaction }
    );
    if (reqRows.length === 0) {
      throw new BusinessError(404, '发货申请不存在');
    }
    const request = reqRows[0];
    if (request.status !== '已发货') {
      throw new BusinessError(400, '仅已发货的申请可撤回出库');
    }

    // 2. 查找最近一次出库对应的 shipping_order
    const [sodRows]: any = await sequelize.query(`
      SELECT DISTINCT so.shipping_order_number, so.creation_date
      FROM shipping_order_detail sod
      INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
      WHERE sod.request_number = :rn
      ORDER BY so.creation_date DESC
    `, { replacements: { rn: request_number }, transaction });

    if (sodRows.length === 0) {
      throw new BusinessError(404, '未找到该申请的发货出库记录');
    }

    const latestShippingOrderNumber = sodRows[0].shipping_order_number;

    // 3. 查找该 shipping_order_number 关联的库存流水
    //    优先按 shipping_order_number 匹配（新出库已写入此字段）
    //    兼容旧数据：若匹配不到，回退到按 source_number + 明细物料 + 时间窗口 匹配
    let [txRows]: any = await sequelize.query(
      "SELECT * FROM inventory_transaction WHERE shipping_order_number = :son AND transaction_type = N'出库' AND source_type = N'发货出库'",
      { replacements: { son: latestShippingOrderNumber }, transaction }
    );

    if (txRows.length === 0) {
      // 兼容旧出库记录：按 source_number + 物料编号匹配最近一批
      const [sodItems]: any = await sequelize.query(
        `SELECT item_number, quantity FROM shipping_order_detail WHERE shipping_order_number = :son`,
        { replacements: { son: latestShippingOrderNumber }, transaction }
      );
      const itemNumbers = (sodItems as any[]).map((d: any) => String(d.item_number));
      // 不依赖 DATEADD（避免日期格式兼容问题），按物料 + 创建时间倒序取最近记录
      const [fallbackTxRows]: any = await sequelize.query(
        `SELECT * FROM inventory_transaction WHERE source_number = :rn AND source_type = N'发货出库' AND transaction_type = N'出库' AND item_number IN (:items) ORDER BY creation_date DESC`,
        { replacements: { rn: request_number, items: itemNumbers }, transaction }
      );
      txRows = fallbackTxRows;
    }

    if (txRows.length === 0) {
      throw new BusinessError(400, '未找到该发货单的库存流水记录，可能该出库是在系统升级前完成的，请联系管理员');
    }

    // 4. 查找批次明细
    //    优先查 inventory_transaction_batch（新出库写入）
    //    兼容旧数据：若无记录，回退到 shipping_order_batch
    const txNumbers = txRows.map((r: any) => r.transaction_number);
    let [batchRows]: any = await sequelize.query(
      `SELECT * FROM inventory_transaction_batch WHERE transaction_number IN (:txns) ORDER BY id`,
      { replacements: { txns: txNumbers }, transaction }
    );

    if (batchRows.length === 0) {
      // 兼容旧出库：从 shipping_order_batch 取批次信息
      const [sobRows]: any = await sequelize.query(
        `SELECT * FROM shipping_order_batch WHERE shipping_order_number = :son ORDER BY id`,
        { replacements: { son: latestShippingOrderNumber }, transaction }
      );
      // 为每条 sob 匹配对应的 inventory_transaction（按物料）
      for (const sob of sobRows) {
        const matchingTx = txRows.find((t: any) => t.item_number === sob.item_number);
        if (matchingTx) {
          batchRows.push({
            transaction_number: matchingTx.transaction_number,
            batch_number: sob.batch_number,
            quantity: sob.quantity
          });
        }
      }
    }

    // 5. 逐行加回批次库存
    for (const b of batchRows) {
      const [batchInv]: any = await sequelize.query(
        `SELECT id, quantity FROM finished_batch_inventory WHERE batch_number = :bn AND item_number = :in AND warehouse_number = :wn`,
        { replacements: { bn: b.batch_number, in: b.item_number || (txRows.find((t: any) => t.transaction_number === b.transaction_number)?.item_number || ''), wn: txRows[0]?.warehouse_number }, transaction }
      );
      // Use the item_number from the corresponding transaction
      const parentTx = txRows.find((t: any) => t.transaction_number === b.transaction_number);
      if (parentTx) {
        const [batchInv2]: any = await sequelize.query(
          `SELECT id, quantity FROM finished_batch_inventory WHERE batch_number = :bn AND item_number = :in AND warehouse_number = :wn`,
          { replacements: { bn: b.batch_number, in: parentTx.item_number, wn: parentTx.warehouse_number }, transaction }
        );
        if (batchInv2.length > 0) {
          const newQty = Number(batchInv2[0].quantity) + Number(b.quantity);
          await sequelize.query(
            `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
            { replacements: { qty: newQty, id: batchInv2[0].id }, transaction }
          );
        } else {
          // 批次已不存在（理论上不应发生），重新创建
          await sequelize.query(`
            INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit,
              product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity,
              production_order_number, inbound_date, status, quality_status, creation_date, last_updated, factory_id)
            VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit,
              :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity,
              N'', GETDATE(), N'正常', N'合格品', GETDATE(), GETDATE(), :factory_id)
          `, {
            replacements: {
              batch_number: b.batch_number,
              item_number: parentTx.item_number, item_name: parentTx.item_name || '',
              specifications: parentTx.specifications || '', basic_unit: parentTx.basic_unit || '',
              product_drawing_number: parentTx.product_drawing_number || '',
              warehouse_number: parentTx.warehouse_number, warehouse_name: parentTx.warehouse_name || '',
              quantity: b.quantity,
              factory_id: null
            }, transaction
          });
        }
      }
    }

    // 6. 加回汇总库存
    for (const tx of txRows) {
      await syncFinishedGoodsSummary(tx.item_number, tx.warehouse_number, transaction, tx.quality_status || '合格品');
    }

    // 7. 批次明细保留（不删除），作为作废流水的审计轨迹

    // 8. 标记库存流水为作废（保留审计轨迹）
    await sequelize.query(
      `UPDATE inventory_transaction SET status = N'作废', void_operator = :op, void_date = GETDATE() WHERE shipping_order_number = :son AND transaction_type = N'出库' AND source_type = N'发货出库'`,
      { replacements: { son: latestShippingOrderNumber, op: operator }, transaction }
    );

    // 9. 查询发货单明细（用于回退销售订单）
    const [sodDetailRows]: any = await sequelize.query(
      `SELECT * FROM shipping_order_detail WHERE shipping_order_number = :son`,
      { replacements: { son: latestShippingOrderNumber }, transaction }
    );

    // 10. 回退销售订单明细的发货数量和状态
    for (const sod of sodDetailRows) {
      if (sod.sales_detail_id && sod.sales_detail_id > 0) {
        await sequelize.query(
          'UPDATE sales_order_detail SET shipped_quantity = ISNULL(shipped_quantity, 0) - :qty WHERE id = :id',
          { replacements: { qty: Number(sod.quantity), id: sod.sales_detail_id }, transaction }
        );
        // 重新计算发货状态
        const [srd]: any = await sequelize.query(
          'SELECT order_quantity, shipped_quantity FROM sales_order_detail WHERE id = :id',
          { replacements: { id: sod.sales_detail_id }, transaction }
        );
        if (srd.length > 0) {
          const orderQty = Number(srd[0].order_quantity) || 0;
          const shippedQty = Math.max(0, Number(srd[0].shipped_quantity) || 0);
          let newStatus = '未发货';
          if (shippedQty > 0 && shippedQty < orderQty) newStatus = '部分发货';
          else if (shippedQty >= orderQty) newStatus = '全部发货';
          await sequelize.query(
            'UPDATE sales_order_detail SET shipping_status = :status WHERE id = :id',
            { replacements: { status: newStatus, id: sod.sales_detail_id }, transaction }
          );
          await syncLineStatus(sod.sales_detail_id, transaction);
        }
      }
    }

    // 11. 删除发货单批次明细
    await sequelize.query(
      `DELETE FROM shipping_order_batch WHERE shipping_order_number = :son`,
      { replacements: { son: latestShippingOrderNumber }, transaction }
    );

    // 12. 删除发货单明细
    await sequelize.query(
      `DELETE FROM shipping_order_detail WHERE shipping_order_number = :son`,
      { replacements: { son: latestShippingOrderNumber }, transaction }
    );

    // 13. 删除发货单
    await sequelize.query(
      `DELETE FROM shipping_order WHERE shipping_order_number = :son`,
      { replacements: { son: latestShippingOrderNumber }, transaction }
    );

    // 14. 检查是否还有其他发货单，若无则恢复状态
    const [remainingSO]: any = await sequelize.query(`
      SELECT COUNT(*) as cnt FROM shipping_order_detail sod
      INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
      WHERE sod.request_number = :rn
    `, { replacements: { rn: request_number }, transaction });

    if (remainingSO[0]?.cnt === 0) {
      await sequelize.query(
        "UPDATE shipping_request SET status = N'已审核' WHERE request_number = :rn",
        { replacements: { rn: request_number }, transaction }
      );
    }

    return {
      shipping_order_number: latestShippingOrderNumber,
      rolledBackTransactions: txNumbers,
      operator
    };
  });
};

/** 生产入库撤回 */
export const rollbackProductionInbound = async (inboundOrderNumber: string, operator: string) => {
  // 1. 校验入库单存在且未被撤回
  const [headerRows]: any = await sequelize.query(
    `SELECT * FROM production_inbound_order WHERE inbound_order_number = :num`,
    { replacements: { num: inboundOrderNumber } }
  );
  if (headerRows.length === 0) {
    throw new BusinessError(404, '入库单不存在');
  }
  const header = headerRows[0];
  if (header.status && header.status.trim() === '已撤回') {
    throw new BusinessError(400, '该入库单已撤回，不可重复操作');
  }

  // 2. 查询入库单明细
  const [details]: any = await sequelize.query(
    `SELECT * FROM production_inbound_order_detail WHERE inbound_order_number = :num`,
    { replacements: { num: inboundOrderNumber } }
  );
  if (details.length === 0) {
    throw new BusinessError(400, '入库单明细为空');
  }

  // 3. 安全检查：成品批次未被出库消耗
  for (const detail of details) {
    const [batchRows]: any = await sequelize.query(
      `SELECT quantity FROM finished_batch_inventory
       WHERE batch_number = :bn AND item_number = :itemNum AND warehouse_number = :whNum`,
      { replacements: { bn: detail.batch_number, itemNum: detail.item_number, whNum: header.warehouse_number } }
    );
    if (batchRows.length > 0) {
      const currentQty = parseFloat(batchRows[0].quantity);
      const inboundQty = parseFloat(detail.inbound_quantity);
      if (currentQty < inboundQty) {
        throw new BusinessError(400,
          `批次 ${detail.batch_number} 已被出库消耗（剩余 ${currentQty}，需回退 ${inboundQty}），请先撤回后续出库操作`);
      }
    }
  }

  // 4. 事务内执行所有反转操作
  return await withTransaction(async (transaction) => {
    const transactionNumbers: string[] = [];
    const batchNumbers: string[] = [];
    const ponQtyMap = new Map<string, number>(); // production_order_number → 回退总量

    // 5. 反转成品批次库存
    for (const detail of details) {
      const inboundQty = parseFloat(detail.inbound_quantity);
      const [batchRows]: any = await sequelize.query(
        `SELECT id, quantity FROM finished_batch_inventory
         WHERE batch_number = :bn AND item_number = :itemNum AND warehouse_number = :whNum`,
        { replacements: { bn: detail.batch_number, itemNum: detail.item_number, whNum: header.warehouse_number }, transaction }
      );

      if (batchRows.length > 0) {
        const currentQty = parseFloat(batchRows[0].quantity);
        if (currentQty - inboundQty <= 0) {
          await sequelize.query(
            `DELETE FROM finished_batch_inventory WHERE id = :id`,
            { replacements: { id: batchRows[0].id }, transaction }
          );
        } else {
          await sequelize.query(
            `UPDATE finished_batch_inventory SET quantity = quantity - :qty, last_updated = GETDATE() WHERE id = :id`,
            { replacements: { qty: inboundQty, id: batchRows[0].id }, transaction }
          );
        }
      }

      // 6. 同步成品汇总库存
      await syncFinishedGoodsSummary(detail.item_number, header.warehouse_number, transaction);

      // 收集流水号和批次号
      if (detail.transaction_number) {
        transactionNumbers.push(detail.transaction_number);
      }
      if (detail.batch_number) {
        batchNumbers.push(detail.batch_number);
      }

      // 按 PON 汇总回退量
      const pon = detail.production_order_number;
      if (pon) {
        ponQtyMap.set(pon, (ponQtyMap.get(pon) || 0) + inboundQty);
      }
    }

    // 7. 标记成品库存流水作废
    if (transactionNumbers.length > 0) {
      await sequelize.query(
        `UPDATE inventory_transaction
         SET status = N'作废', void_operator = :op, void_date = GETDATE()
         WHERE transaction_number IN (:txns)
           AND (status IS NULL OR status = N'正常')`,
        { replacements: { op: operator, txns: transactionNumbers }, transaction }
      );
    }

    // 8. 回退生产单入库数量和状态（使用 GREATEST 防止 inbound_quantity 变负数）
    for (const [pon, rollbackQty] of ponQtyMap) {
      await sequelize.query(
        `UPDATE production_order
         SET inbound_quantity = CASE WHEN inbound_quantity - :rollbackQty < 0 THEN 0 ELSE inbound_quantity - :rollbackQty END,
             inbound_status = CASE
               WHEN inbound_quantity - :rollbackQty2 <= 0 THEN N'未入库'
               WHEN inbound_quantity - :rollbackQty3 < planned_quantity THEN N'部分入库'
               ELSE N'全部入库'
             END
         WHERE production_order_number = :pon`,
        { replacements: { rollbackQty, rollbackQty2: rollbackQty, rollbackQty3: rollbackQty, pon }, transaction }
      );
    }

    // 8b. 重算各生产单综合合格率（入库量回退）
    for (const pon of ponQtyMap.keys()) {
      await recalcYieldRate(pon, transaction);
    }

    // 9. 反转倒冲扣减
    for (const [pon, inboundQty] of ponQtyMap) {
      // 查询倒冲扣减日志，按 production_order_number + inbound_quantity 匹配
      const [deductionLogs]: any = await sequelize.query(
        `SELECT * FROM backflush_deduction_log
         WHERE production_order_number = :pon
           AND inbound_quantity = :inboundQty
           AND status = N'成功'
         ORDER BY deduction_date DESC`,
        { replacements: { pon, inboundQty }, transaction }
      );

      for (const dlog of deductionLogs) {
        // a. 解析 batch_deductions JSON
        let batchDeductions: Array<{ batch_number: string; quantity: number }> = [];
        try {
          if (dlog.batch_deductions) {
            batchDeductions = JSON.parse(dlog.batch_deductions);
          }
        } catch { /* ignore parse error */ }

        // b. 物料批次加回
        for (const bd of batchDeductions) {
          await sequelize.query(
            `UPDATE material_batch_inventory
             SET quantity = quantity + :qty, last_updated = GETDATE()
             WHERE batch_number = :bn AND item_number = :matNum
               AND warehouse_number = :whNum`,
            { replacements: { qty: bd.quantity, bn: bd.batch_number, matNum: dlog.material_number, whNum: dlog.warehouse_number }, transaction }
          );
        }

        // c. 物料汇总库存加回
        const deductQty = parseFloat(dlog.deduction_quantity) || 0;
        if (deductQty > 0) {
          await sequelize.query(
            `UPDATE material_inventory
             SET quantity = quantity + :deductQty, last_updated = GETDATE()
             WHERE item_number = :matNum AND warehouse_number = :whNum`,
            { replacements: { deductQty, matNum: dlog.material_number, whNum: dlog.warehouse_number }, transaction }
          );
        }

        // d. 标记物料流水作废
        if (dlog.transaction_number) {
          await sequelize.query(
            `UPDATE material_inventory_transaction
             SET status = N'作废', void_operator = :op, void_date = GETDATE()
             WHERE transaction_number = :txNum
               AND (status IS NULL OR status = N'正常')`,
            { replacements: { op: operator, txNum: dlog.transaction_number }, transaction }
          );
        }

        // e. 回退倒冲任务状态
        if (dlog.backflush_task_id) {
          await sequelize.query(
            `UPDATE backflush_task
             SET deducted_quantity = deducted_quantity - :deductQty,
                 deduction_status = CASE
                   WHEN deducted_quantity - :deductQty2 <= 0 THEN N'待扣减'
                   ELSE N'部分扣减'
                 END,
                 error_message = '',
                 last_updated = GETDATE()
             WHERE id = :taskId`,
            { replacements: { deductQty, deductQty2: deductQty, taskId: dlog.backflush_task_id }, transaction }
          );
        }

        // f. 标记 deduction_log 为已撤回
        await sequelize.query(
          `UPDATE backflush_deduction_log SET status = N'已撤回' WHERE id = :logId`,
          { replacements: { logId: dlog.id }, transaction }
        );
      }
    }

    // 10. 删除批次追溯记录
    if (batchNumbers.length > 0) {
      const ponList = Array.from(ponQtyMap.keys());
      await sequelize.query(
        `DELETE FROM batch_traceability
         WHERE finished_batch_number IN (:batchNos)
           AND production_order_number IN (:pons)`,
        { replacements: { batchNos: batchNumbers, pons: ponList }, transaction }
      );
    }

    // 11. 更新入库单状态
    await sequelize.query(
      `UPDATE production_inbound_order
       SET status = N'已撤回', withdraw_operator = :op, withdraw_date = GETDATE()
       WHERE inbound_order_number = :num`,
      { replacements: { op: operator, num: inboundOrderNumber }, transaction }
    );

    return {
      inbound_order_number: inboundOrderNumber,
      rolledBackTransactions: transactionNumbers,
      operator
    };
  });
};
