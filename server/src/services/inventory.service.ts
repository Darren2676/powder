/**
 * 库存服务 - 批次号生成、事务号生成、库存汇总同步
 * 从 materialWarehouse.controller 和 finishedGoods.controller 抽取
 */
import sequelize from '@/config/database'
import { Transaction } from 'sequelize'

// ==================== 批次号生成 ====================

export const generateBatchNumber = async (type: 'MB' | 'HB' | 'FB', factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `${type}${fc}-${dateStr}-`;

  const txOpt = transaction ? { transaction } : {};

  const [existing]: any = await sequelize.query(
    `SELECT id, current_seq FROM batch_number_sequence WHERE prefix = :prefix`,
    { replacements: { prefix }, ...txOpt }
  );

  let seq: number;
  if (existing.length > 0) {
    seq = existing[0].current_seq + 1;
    await sequelize.query(
      `UPDATE batch_number_sequence SET current_seq = :seq, last_updated = GETDATE() WHERE id = :id`,
      { replacements: { seq, id: existing[0].id }, ...txOpt }
    );
  } else {
    seq = 1;
    await sequelize.query(
      `INSERT INTO batch_number_sequence (prefix, current_seq, last_updated) VALUES (:prefix, :seq, GETDATE())`,
      { replacements: { prefix, seq }, ...txOpt }
    );
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 库存事务号生成 ====================

export const generateTransactionNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `IT${fc}-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(transaction_number) as max_num FROM inventory_transaction WHERE transaction_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, ...(transaction ? { transaction } : {}) }
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

export const generateMaterialTxnNumber = async (factoryCode: string = '', transaction?: Transaction): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `MT${fc}-${dateStr}-`;

  const opts: any = transaction ? { replacements: { prefix: prefix + '%' }, transaction } : { replacements: { prefix: prefix + '%' } };
  const [rows]: any = await sequelize.query(
    `SELECT MAX(transaction_number) as max_num FROM material_inventory_transaction WHERE transaction_number LIKE :prefix`,
    opts
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 库存汇总同步 ====================

export const syncMaterialInventorySummary = async (
  itemNumber: string, warehouseNumber: string, transaction?: Transaction
) => {
  const opts: any = transaction ? { replacements: { item_number: itemNumber, warehouse_number: warehouseNumber }, transaction } : { replacements: { item_number: itemNumber, warehouse_number: warehouseNumber } };

  const [sumRows]: any = await sequelize.query(
    `SELECT ISNULL(SUM(quantity), 0) as total_qty FROM material_batch_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number AND status != N'冻结'`,
    opts
  );
  const totalQty = Number(sumRows[0]?.total_qty) || 0;

  const [existing]: any = await sequelize.query(
    `SELECT id FROM material_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number`,
    opts
  );

  if (existing.length > 0) {
    await sequelize.query(
      `UPDATE material_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
      { replacements: { qty: totalQty, id: existing[0].id }, ...(transaction ? { transaction } : {}) }
    );
  }
};

export const syncFinishedGoodsSummary = async (
  itemNumber: string, warehouseNumber: string, transaction?: Transaction, qualityStatus?: string
) => {
  const baseReplacements: any = { item_number: itemNumber, warehouse_number: warehouseNumber };
  const txOpt: any = transaction ? { transaction } : {};

  const statusList = qualityStatus ? [qualityStatus] : ['合格品', '不合格品'];

  for (const qs of statusList) {
    // 散装批次库存
    const [sumRows]: any = await sequelize.query(
      `SELECT ISNULL(SUM(quantity), 0) as total_qty FROM finished_batch_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number AND quality_status = :qs AND status != N'冻结'`,
      { replacements: { ...baseReplacements, qs }, ...txOpt }
    );
    const batchQty = Number(sumRows[0]?.total_qty) || 0;

    // 箱装库存（在库状态的箱）
    const [boxSumRows]: any = await sequelize.query(
      `SELECT ISNULL(SUM(total_quantity), 0) as total_qty FROM packing_box_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number AND status = N'在库'`,
      { replacements: { ...baseReplacements }, ...txOpt }
    );
    const boxQty = Number(boxSumRows[0]?.total_qty) || 0;

    const totalQty = batchQty + boxQty;

    const [existing]: any = await sequelize.query(
      `SELECT id FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number AND quality_status = :qs`,
      { replacements: { ...baseReplacements, qs }, ...txOpt }
    );

    if (existing.length > 0) {
      await sequelize.query(
        `UPDATE finished_goods_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
        { replacements: { qty: totalQty, id: existing[0].id }, ...txOpt }
      );
    }
  }
};
