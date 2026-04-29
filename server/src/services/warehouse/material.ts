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
import { upsertMaterialInventory, createMaterialTransaction, fifoDeductBatches, writeBatchTraceability } from './helpers';

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
