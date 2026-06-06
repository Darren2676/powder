/**
 * 仓库服务 - 物料仓业务逻辑
 * 从 warehouse.service.ts 拆分
 */
import sequelize from '@/config/database';
import { BusinessError } from '@/shared/errors/BusinessError';
import {
  generateBatchNumber,
  generateMaterialTxnNumber,
  syncMaterialInventorySummary,
} from '@/services/inventory.service';
import { withTransaction } from '@/shared/db/withTransaction';
import { executeBackflushDeduction } from '@/services/backflushTask.service';
import { generateSemiProductionInboundOrderNumber } from '@/services/documentNumber.service';
import { upsertMaterialInventory, createMaterialTransaction, fifoDeductBatches, writeBatchTraceability, validateAccountingPeriodOpen } from './helpers';

// ==================== 物料仓 - Main Exported Functions ====================

/** 原材料手工入库 */
export const manualInboundMaterial = async (
  params: {
    items: Array<{
      item_number: string; item_name?: string; item_type?: string;
      specifications?: string; basic_unit?: string; quantity: number;
      supplier_number?: string; supplier_name?: string;
      production_date?: string;
    }>;
    warehouse_number: string; warehouse_name: string; remark?: string;
    accounting_period?: string;
  },
  operator: string,
  factoryCode: string = '',
  _factoryId: number | null = null
) => {
  const b = params;
  if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
    throw new BusinessError(400, '请添加至少一条入库记录');
  }
  if (!b.warehouse_number || !b.warehouse_name) {
    throw new BusinessError(400, '请选择入库仓库');
  }

  const accountingPeriod = b.accounting_period || new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  await validateAccountingPeriodOpen(accountingPeriod);

  return await withTransaction(async (transaction) => {
    const transactionNumbers: string[] = [];
    const batchNumbers: string[] = [];

    for (const item of b.items) {
      const inboundQty = Number(item.quantity) || 0;
      if (inboundQty <= 0) continue;

      // 1. 自动生成批次号
      const batchNo = await generateBatchNumber('MB', factoryCode, transaction);
      batchNumbers.push(batchNo);

      // 2. 写入批次库存表
      await sequelize.query(
        "INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity, supplier_number, supplier_name, inbound_date, production_date, status, creation_date, last_updated, factory_id) VALUES (:batch_number, :item_number, :item_name, :item_type, :specifications, :basic_unit, :warehouse_number, :warehouse_name, :quantity, :quantity, :supplier_number, :supplier_name, GETDATE(), :production_date, N'正常', GETDATE(), GETDATE(), :factory_id)",
        {
          replacements: {
            batch_number: batchNo,
            item_number: item.item_number, item_name: item.item_name || '',
            item_type: item.item_type || '原材料',
            specifications: item.specifications || '', basic_unit: item.basic_unit || '',
            warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
            quantity: inboundQty,
            supplier_number: item.supplier_number || '', supplier_name: item.supplier_name || '',
            production_date: item.production_date || null,
            factory_id: _factoryId
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
      const txNum = await generateMaterialTxnNumber(factoryCode, transaction);
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
        accounting_period: accountingPeriod,
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
      production_date?: string;
    }>;
    warehouse_number: string; warehouse_name: string; remark?: string;
    accounting_period?: string;
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

  const prodAP = b.accounting_period || new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  await validateAccountingPeriodOpen(prodAP);

  return await withTransaction(async (transaction) => {
    const transactionNumbers: string[] = [];
    const batchNumbers: string[] = [];

    for (const item of b.items) {
      const inboundQty = Number(item.inbound_qty) || 0;
      if (inboundQty <= 0) continue;

      // 1. 自动生成半成品批次号
      const batchNo = await generateBatchNumber('HB', factoryCode, transaction);
      batchNumbers.push(batchNo);

      // 2. 写入批次库存表
      await sequelize.query(
        "INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity, production_order_number, inbound_date, production_date, status, creation_date, last_updated, factory_id) VALUES (:batch_number, :item_number, :item_name, N'半成品', :specifications, :basic_unit, :warehouse_number, :warehouse_name, :quantity, :quantity, :production_order_number, GETDATE(), :production_date, N'正常', GETDATE(), GETDATE(), :factory_id)",
        {
          replacements: {
            batch_number: batchNo,
            item_number: item.item_number, item_name: item.item_name || '',
            specifications: item.specifications || '', basic_unit: item.basic_unit || '',
            warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
            quantity: inboundQty,
            production_order_number: item.production_order_number || '',
            production_date: item.production_date || null,
            factory_id: _factoryId
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
      const txNum = await generateMaterialTxnNumber(factoryCode, transaction);
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
        accounting_period: prodAP,
        operator, remark: b.remark || ''
      }, transaction);

      // 5. 更新生产单入库状态
      const currentInbound = Number(item.inbound_quantity) || 0;
      const totalInbound = currentInbound + inboundQty;
      // 使用末道正品数判断入库状态，而非计划数量
      let compareQty = Number(item.planned_quantity) || 0;
      if (item.production_order_number) {
        const [lastStepResult]: any = await sequelize.query(
          `SELECT ISNULL(SUM(ISNULL(qualified_quantity, 0)), 0) as last_qualified FROM work_report WHERE production_order_number = :pon AND step_number = (SELECT MAX(step_number) FROM work_report WHERE production_order_number = :pon)`,
          { replacements: { pon: item.production_order_number }, transaction }
        );
        const lastStepQualified = Number(lastStepResult[0]?.last_qualified) || 0;
        if (lastStepQualified > 0) compareQty = lastStepQualified;
      }
      const newInboundStatus = totalInbound >= compareQty ? '全部入库' : '部分入库';

      await sequelize.query(
        'UPDATE production_order SET inbound_quantity = :totalInbound, inbound_status = :status WHERE production_order_number = :pon',
        { replacements: { totalInbound, status: newInboundStatus, pon: item.production_order_number }, transaction }
      );

      // 5.5 倒冲扣减：半成品入库时自动扣减倒冲物料库存（扣减失败则阻止入库，保证账务平衡）
      if (item.production_order_number) {
        await executeBackflushDeduction(item.production_order_number, inboundQty, operator, transaction, factoryCode);
      }

      // 6. 写入追溯关联（半成品入库时，反查该生产单的领料批次）
      await writeBatchTraceability({
        finishedBatchNumber: batchNo, finishedItemNumber: item.item_number,
        finishedItemName: item.item_name || '', productionOrderNumber: item.production_order_number || '',
      }, transaction);
    }

    // ====== 生成半成品生产入库单 ======
    const inboundOrderNo = await generateSemiProductionInboundOrderNumber(factoryCode, transaction);
    let totalQty = 0;
    let lineNum = 0;
    for (let i = 0; i < b.items.length; i++) {
      const item = b.items[i];
      const inboundQty = Number(item.inbound_qty) || 0;
      if (inboundQty <= 0) continue;
      lineNum++;
      totalQty += inboundQty;

      await sequelize.query(
        "INSERT INTO semi_production_inbound_order_detail (inbound_order_number, line_number, production_order_number, item_number, item_name, item_type, specifications, basic_unit, batch_number, planned_quantity, inbound_quantity, transaction_number, production_date, remark, creation_date) VALUES (:inbound_order_number, :line_number, :production_order_number, :item_number, :item_name, N'半成品', :specifications, :basic_unit, :batch_number, :planned_quantity, :inbound_quantity, :transaction_number, :production_date, :remark, GETDATE())",
        {
          replacements: {
            inbound_order_number: inboundOrderNo, line_number: lineNum,
            production_order_number: item.production_order_number || '',
            item_number: item.item_number, item_name: item.item_name || '',
            specifications: item.specifications || '', basic_unit: item.basic_unit || '',
            batch_number: batchNumbers[i] || '',
            planned_quantity: Number(item.planned_quantity) || 0,
            inbound_quantity: inboundQty,
            transaction_number: transactionNumbers[i] || '',
            production_date: item.production_date || null,
            remark: b.remark || ''
          }, transaction
        }
      );
    }

    await sequelize.query(
      'INSERT INTO semi_production_inbound_order (inbound_order_number, warehouse_number, warehouse_name, total_quantity, total_items, remark, accounting_period, operator, inbound_date, creation_date) VALUES (:inbound_order_number, :warehouse_number, :warehouse_name, :total_quantity, :total_items, :remark, :accounting_period, :operator, GETDATE(), GETDATE())',
      {
        replacements: {
          inbound_order_number: inboundOrderNo,
          warehouse_number: b.warehouse_number, warehouse_name: b.warehouse_name,
          total_quantity: totalQty, total_items: lineNum,
          remark: b.remark || '', accounting_period: prodAP, operator
        }, transaction
      }
    );

    return { transactionNumbers, batchNumbers, inboundOrderNumber: inboundOrderNo };
  });
};


/** 手工出库（物料批次FIFO） */
export const manualOutboundMaterial = async (
  params: {
    item_number: string; warehouse_number: string; quantity: number;
    batch_items?: Array<{ batch_number: string; quantity: number }>; remark?: string;
    accounting_period?: string;
  },
  operator: string,
  factoryCode: string = ''
) => {
  const b = params;
  if (!b.item_number || !b.warehouse_number) {
    throw new BusinessError(400, '请选择物料和仓库');
  }
  const outQty = Number(b.quantity) || 0;
  if (outQty <= 0) {
    throw new BusinessError(400, '出库数量必须大于0');
  }

  const outboundAP = b.accounting_period || new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  await validateAccountingPeriodOpen(outboundAP);

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
      const txNum = await generateMaterialTxnNumber(factoryCode, transaction);
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
        accounting_period: outboundAP,
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
    accounting_period?: string;
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

  const adjustAP = b.accounting_period || new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  await validateAccountingPeriodOpen(adjustAP);

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

    const txNum = await generateMaterialTxnNumber(factoryCode, transaction);
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
      accounting_period: adjustAP,
      operator, remark: b.remark || '手动调整'
    }, transaction);

    return { transaction_number: txNum };
  });
};

/** 半成品生产入库撤回 */
export const rollbackSemiProductionInbound = async (inboundOrderNumber: string, operator: string) => {
  // 1. 校验入库单存在且未被撤回
  const [headerRows]: any = await sequelize.query(
    `SELECT * FROM semi_production_inbound_order WHERE inbound_order_number = :num`,
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
    `SELECT * FROM semi_production_inbound_order_detail WHERE inbound_order_number = :num`,
    { replacements: { num: inboundOrderNumber } }
  );
  if (details.length === 0) {
    throw new BusinessError(400, '入库单明细为空');
  }

  // 3. 安全检查：物料批次未被出库消耗
  for (const detail of details) {
    const [batchRows]: any = await sequelize.query(
      `SELECT quantity FROM material_batch_inventory
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
    const ponQtyMap = new Map<string, number>();

    // 5. 反转物料批次库存
    for (const detail of details) {
      const inboundQty = parseFloat(detail.inbound_quantity);
      const [batchRows]: any = await sequelize.query(
        `SELECT id, quantity FROM material_batch_inventory
         WHERE batch_number = :bn AND item_number = :itemNum AND warehouse_number = :whNum`,
        { replacements: { bn: detail.batch_number, itemNum: detail.item_number, whNum: header.warehouse_number }, transaction }
      );

      if (batchRows.length > 0) {
        const currentQty = parseFloat(batchRows[0].quantity);
        if (currentQty - inboundQty <= 0) {
          await sequelize.query(
            `DELETE FROM material_batch_inventory WHERE id = :id`,
            { replacements: { id: batchRows[0].id }, transaction }
          );
        } else {
          await sequelize.query(
            `UPDATE material_batch_inventory SET quantity = quantity - :qty, last_updated = GETDATE() WHERE id = :id`,
            { replacements: { qty: inboundQty, id: batchRows[0].id }, transaction }
          );
        }
      }

      // 6. 同步物料汇总库存
      await syncMaterialInventorySummary(detail.item_number, header.warehouse_number, transaction);

      if (detail.transaction_number) transactionNumbers.push(detail.transaction_number);
      if (detail.batch_number) batchNumbers.push(detail.batch_number);

      const pon = detail.production_order_number;
      if (pon) {
        ponQtyMap.set(pon, (ponQtyMap.get(pon) || 0) + inboundQty);
      }
    }

    // 7. 标记物料库存流水作废
    if (transactionNumbers.length > 0) {
      await sequelize.query(
        `UPDATE material_inventory_transaction
         SET status = N'作废', void_operator = :op, void_date = GETDATE()
         WHERE transaction_number IN (:txns)
           AND (status IS NULL OR status = N'正常')`,
        { replacements: { op: operator, txns: transactionNumbers }, transaction }
      );
    }

    // 8. 回退生产单入库数量和状态
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

    // 9. 反转倒冲扣减
    for (const [pon, inboundQty] of ponQtyMap) {
      const [deductionLogs]: any = await sequelize.query(
        `SELECT * FROM backflush_deduction_log
         WHERE production_order_number = :pon
           AND inbound_quantity = :inboundQty
           AND status = N'成功'
         ORDER BY deduction_date DESC`,
        { replacements: { pon, inboundQty }, transaction }
      );

      for (const dlog of deductionLogs) {
        let batchDeductions: Array<{ batch_number: string; quantity: number }> = [];
        try { if (dlog.batch_deductions) batchDeductions = JSON.parse(dlog.batch_deductions); } catch { /* ignore */ }

        for (const bd of batchDeductions) {
          await sequelize.query(
            `UPDATE material_batch_inventory SET quantity = quantity + :qty, last_updated = GETDATE()
             WHERE batch_number = :bn AND item_number = :matNum AND warehouse_number = :whNum`,
            { replacements: { qty: bd.quantity, bn: bd.batch_number, matNum: dlog.material_number, whNum: dlog.warehouse_number }, transaction }
          );
        }

        const deductQty = parseFloat(dlog.deduction_quantity) || 0;
        if (deductQty > 0) {
          await sequelize.query(
            `UPDATE material_inventory SET quantity = quantity + :deductQty, last_updated = GETDATE()
             WHERE item_number = :matNum AND warehouse_number = :whNum`,
            { replacements: { deductQty, matNum: dlog.material_number, whNum: dlog.warehouse_number }, transaction }
          );
        }

        if (dlog.transaction_number) {
          await sequelize.query(
            `UPDATE material_inventory_transaction SET status = N'作废', void_operator = :op, void_date = GETDATE()
             WHERE transaction_number = :txNum AND (status IS NULL OR status = N'正常')`,
            { replacements: { op: operator, txNum: dlog.transaction_number }, transaction }
          );
        }

        if (dlog.backflush_task_id) {
          await sequelize.query(
            `UPDATE backflush_task SET deducted_quantity = deducted_quantity - :deductQty,
                deduction_status = CASE WHEN deducted_quantity - :deductQty2 <= 0 THEN N'待扣减' ELSE N'部分扣减' END,
                error_message = '', last_updated = GETDATE()
             WHERE id = :taskId`,
            { replacements: { deductQty, deductQty2: deductQty, taskId: dlog.backflush_task_id }, transaction }
          );
        }

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
        `DELETE FROM batch_traceability WHERE finished_batch_number IN (:batchNos) AND production_order_number IN (:pons)`,
        { replacements: { batchNos: batchNumbers, pons: ponList }, transaction }
      );
    }

    // 11. 更新入库单状态
    await sequelize.query(
      `UPDATE semi_production_inbound_order SET status = N'已撤回', withdraw_operator = :op, withdraw_date = GETDATE() WHERE inbound_order_number = :num`,
      { replacements: { op: operator, num: inboundOrderNumber }, transaction }
    );

    return { inbound_order_number: inboundOrderNumber, rolledBackTransactions: transactionNumbers, operator };
  });
};
