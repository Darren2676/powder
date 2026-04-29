/**
 * 仓库服务 - 内部辅助函数
 * 从 warehouse.service.ts 拆分
 * 不对外导出，仅供 finishedGoods.ts 和 material.ts 使用
 */
import sequelize from '@/config/database';
import { Transaction } from 'sequelize';
import { BusinessError } from '@/shared/errors/BusinessError';

/** Upsert 成品汇总库存表 (finished_goods_inventory) */
export const upsertFinishedGoodsInventory = async (
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
export const upsertMaterialInventory = async (
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
export const createFinishedTransaction = async (
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
export const createMaterialTransaction = async (
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
export const fifoDeductBatches = async (
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
export const writeBatchTraceability = async (
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
