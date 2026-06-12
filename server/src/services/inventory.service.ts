/**
 * 库存服务 - 批次号生成、事务号生成、库存汇总同步
 * 从 materialWarehouse.controller 和 finishedGoods.controller 抽取
 * 
 * 双模式批次号：
 *   模式A（默认）：入库时自动生成 generateBatchNumber() → FB-N-20260609-001
 *   模式B（新增）：计划派发时预分配 → FB-MN20260609001
 *   统一入口：resolveBatchNumber()
 */
import sequelize from '@/config/database'
import { Transaction } from 'sequelize'
import { createLogger } from '@/config/logger'

const log = createLogger('inventory-service')

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

// ==================== 双模式批次号：查询规则 + 统一入口 ====================

/**
 * 查询产品的批次号产生规则（含优先级解析）
 * 优先级：精确匹配(item_number+factory_id) > 全局匹配(item_number+null) > 默认模式A
 */
export const lookupBatchRule = async (
  itemNumber: string,
  factoryId: number | null = null,
  transaction?: any
): Promise<{ mode: 'A' | 'B'; template: string; append_split_seq: boolean } | null> => {
  const txOpt: any = transaction ? { transaction } : {};

  // 1. 精确匹配：item_number + factory_id
  if (factoryId !== null) {
    const [exactRows]: any = await sequelize.query(
      `SELECT TOP 1 batch_rule_mode, batch_number_template, ISNULL(append_split_seq, 1) AS append_split_seq FROM batch_number_rule_config
       WHERE item_number = :item_number AND factory_id = :factory_id AND is_active = N'是'`,
      { replacements: { item_number: itemNumber, factory_id: factoryId }, ...txOpt }
    );
    if (exactRows.length > 0) {
      return { mode: exactRows[0].batch_rule_mode as 'A' | 'B', template: exactRows[0].batch_number_template, append_split_seq: !!exactRows[0].append_split_seq };
    }
  }

  // 2. 全局匹配：item_number + factory_id IS NULL
  const [globalRows]: any = await sequelize.query(
    `SELECT TOP 1 batch_rule_mode, batch_number_template, ISNULL(append_split_seq, 1) AS append_split_seq FROM batch_number_rule_config
     WHERE item_number = :item_number AND factory_id IS NULL AND is_active = N'是'`,
    { replacements: { item_number: itemNumber }, ...txOpt }
  );
  if (globalRows.length > 0) {
    return { mode: globalRows[0].batch_rule_mode as 'A' | 'B', template: globalRows[0].batch_number_template, append_split_seq: !!globalRows[0].append_split_seq };
  }

  // 3. 无配置 → 默认模式A
  return null;
};

/**
 * 生成模式B的预分配批次号
 * 格式：FB-{production_number}[-S{nn}]
 * - 不拆分：FB-MN20260609001
 * - 拆分且追加序号：FB-MN20260609001-S01, FB-MN20260609001-S02
 * - 拆分不追加序号：FB-MN20260609001（所有拆分子单共享同一批次号）
 */
export const generatePreassignedBatchNumber = (
  productionNumber: string,
  splitIndex?: number,       // 从1开始，undefined表示不拆分
  appendSplitSeq: boolean = true  // 是否在拆分时追加序号
): string => {
  const base = `FB-${productionNumber}`;
  if (appendSplitSeq && splitIndex !== undefined && splitIndex > 0) {
    return `${base}-S${String(splitIndex).padStart(2, '0')}`;
  }
  return base;
};

/**
 * 统一批次号生成入口（入库时调用）
 * - 模式A：调用 generateBatchNumber('FB', factoryCode)
 * - 模式B：读取 production_order.preassigned_batch_number
 * - 降级：模式B但预分配为空时，降级为模式A
 */
export const resolveBatchNumber = async (params: {
  itemNumber: string;
  factoryId: number | null;
  productionOrderNumber: string;
  factoryCode: string;
  transaction?: any;
}): Promise<string> => {
  const { itemNumber, factoryId, productionOrderNumber, factoryCode, transaction } = params;
  const txOpt: any = transaction ? { transaction } : {};

  // 0. 优先从 Production_plan.batch_number 读取（计划派发时预生成的批次号）
  const [planRows]: any = await sequelize.query(
    `SELECT pp.batch_number FROM Production_plan pp
     INNER JOIN production_order po ON po.production_number = pp.production_number
     WHERE po.production_order_number = :pon`,
    { replacements: { pon: productionOrderNumber }, ...txOpt }
  );
  if (planRows.length > 0 && planRows[0].batch_number) {
    return planRows[0].batch_number;
  }

  // 1. 查询产品批次号规则
  const rule = await lookupBatchRule(itemNumber, factoryId, transaction);

  // 2. 模式B：读取预分配批次号
  if (rule?.mode === 'B') {
    const [poRows]: any = await sequelize.query(
      `SELECT preassigned_batch_number FROM production_order WHERE production_order_number = :pon`,
      { replacements: { pon: productionOrderNumber }, ...txOpt }
    );
    if (poRows.length > 0 && poRows[0].preassigned_batch_number) {
      return poRows[0].preassigned_batch_number;
    }
    // 降级：预分配为空
    log.warn({ itemNumber, productionOrderNumber }, '模式B但预分配为空, 降级为模式A');
  }

  // 3. 模式A（默认）：入库时自动生成
  return generateBatchNumber('FB', factoryCode, transaction);
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
