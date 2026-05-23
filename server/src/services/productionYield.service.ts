/**
 * 生产单综合合格率计算服务
 * 
 * 公式：综合合格率 = 入库正品数 / (入库正品数 + 各道工序不合格品数) × 100%
 * 
 * 计算时机：
 * 1. 报工创建/删除后（unqualified_quantity 变化）
 * 2. 生产入库确认后（inbound_quantity 变化）
 * 3. 生产入库撤回后（inbound_quantity 回退）
 * 4. 不合格品处理后（返修回退等可能导致 unqualified 变化）
 */
import sequelize from '../config/database';
import { createLogger } from '../config/logger';

const log = createLogger('productionYield');

/**
 * 重算生产单综合合格率
 * @param productionOrderNumber 生产单编号
 * @param transaction 可选的数据库事务
 */
export const recalcYieldRate = async (
  productionOrderNumber: string,
  transaction?: any
): Promise<void> => {
  if (!productionOrderNumber) return;

  try {
    const tOpts = transaction ? { transaction } : {};

    // 1. 获取入库正品数
    const [orderRows]: any = await sequelize.query(
      `SELECT ISNULL(inbound_quantity, 0) AS inbound_qty FROM production_order WHERE production_order_number = :pon`,
      { replacements: { pon: productionOrderNumber }, ...tOpts }
    );
    if (orderRows.length === 0) return;
    const inboundQty = parseFloat(orderRows[0].inbound_qty) || 0;

    // 2. 获取各道工序不合格品数
    const [unqRows]: any = await sequelize.query(
      `SELECT ISNULL(SUM(unqualified_quantity), 0) AS total_unqualified FROM work_report WHERE production_order_number = :pon`,
      { replacements: { pon: productionOrderNumber }, ...tOpts }
    );
    const totalUnqualified = parseFloat(unqRows[0].total_unqualified) || 0;

    // 3. 计算综合合格率
    const denominator = inboundQty + totalUnqualified;
    let yieldRate: number | null = null;
    if (denominator > 0) {
      yieldRate = Math.round(inboundQty * 10000 / denominator) / 100; // 保留2位小数
    }
    // 如果入库量为0且不合格量为0，保持NULL（未开始/未入库的生产单）

    // 4. 写回 production_order
    await sequelize.query(
      `UPDATE production_order SET yield_rate = :yr WHERE production_order_number = :pon`,
      { replacements: { yr: yieldRate, pon: productionOrderNumber }, ...tOpts }
    );

    log.info({ productionOrderNumber, inboundQty, totalUnqualified, yieldRate }, '综合合格率计算完成');
  } catch (err) {
    log.error({ err, productionOrderNumber }, '综合合格率计算失败');
    // 不抛出异常，避免影响主流程
  }
};

/**
 * 批量重算多个生产单的综合合格率
 */
export const recalcYieldRateBatch = async (
  productionOrderNumbers: string[],
  transaction?: any
): Promise<void> => {
  for (const pon of productionOrderNumbers) {
    await recalcYieldRate(pon, transaction);
  }
};
