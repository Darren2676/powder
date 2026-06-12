/**
 * 销售订单状态同步服务
 * 集中管理 sales_order_detail 的 return_status / production_status / status(行状态)
 * 以及 sales_order.order_status 的自动汇总
 * 以及 Production_plan.plan_status 与 production_order.plan_status 的同步
 */
import sequelize from '@/config/database';
import { createLogger } from '@/config/logger';
import { lookupBatchRule, generateBatchNumber } from '@/services/inventory.service';
import { checkAndAutoComplete } from '@/services/documentAutoComplete.service';

const log = createLogger('salesOrderSync');

// ==================== 1. 退货状态同步 ====================
export const syncReturnStatus = async (detailId: number, transaction: any): Promise<void> => {
  const [rows]: any = await sequelize.query(
    `SELECT ISNULL(shipped_quantity, 0) as shipped_quantity,
            ISNULL(refunded_quantity, 0) as refunded_quantity
     FROM sales_order_detail WHERE id = :detailId`,
    { replacements: { detailId }, transaction }
  );
  if (rows.length === 0) return;

  const shippedQty = Number(rows[0].shipped_quantity) || 0;
  const refundedQty = Number(rows[0].refunded_quantity) || 0;

  let returnStatus = '未申请';
  if (refundedQty > 0) {
    returnStatus = refundedQty >= shippedQty ? '全部退货' : '部分退货';
  } else if (shippedQty > 0) {
    returnStatus = '未退货';
  }

  await sequelize.query(
    `UPDATE sales_order_detail SET return_status = :status WHERE id = :detailId`,
    { replacements: { status: returnStatus, detailId }, transaction }
  );
};

// ==================== 2. 生产状态同步 ====================
// 通过 production_order → Production_plan → sales_order_detail 回写
export const syncProductionStatus = async (
  productionOrderNumber: string,
  newStatus: string,
  transaction?: any
): Promise<void> => {
  try {
    const txOpt = transaction ? { transaction } : {};

    // 通过 production_order.production_number → Production_plan.source_order_number + source_line_number
    const [rows]: any = await sequelize.query(`
      SELECT pp.source_order_number, pp.source_line_number
      FROM production_order po
      INNER JOIN Production_plan pp ON pp.production_number = po.production_number
      WHERE po.production_order_number = :orderNo
        AND pp.source_order_number IS NOT NULL
        AND pp.source_order_number != ''
        AND pp.source_line_number IS NOT NULL
    `, { replacements: { orderNo: productionOrderNumber }, ...txOpt });

    if (rows.length === 0) return;

    const { source_order_number, source_line_number } = rows[0];

    // 确认 source_order_number 指向真实的销售订单（排除预测单等）
    const [soCheck]: any = await sequelize.query(
      `SELECT 1 FROM sales_order WHERE sales_order_number = :son`,
      { replacements: { son: source_order_number }, ...txOpt }
    );
    if (soCheck.length === 0) return;

    // 单向递进：只允许状态向前推进，不回退
    const statusOrder: Record<string, number> = {
      '未加入计划': 0, '待排产': 1, '计划中': 2, '待生产': 3, '生产中': 4, '生产完成': 5
    };
    const newRank = statusOrder[newStatus] ?? -1;
    if (newRank < 0) return;

    const [current]: any = await sequelize.query(
      `SELECT id, production_status FROM sales_order_detail
       WHERE sales_order_number = :son AND line_number = :ln`,
      { replacements: { son: source_order_number, ln: source_line_number }, ...txOpt }
    );
    if (current.length === 0) return;

    const currentRank = statusOrder[current[0].production_status] ?? 0;
    if (newRank <= currentRank) return; // 不回退

    await sequelize.query(
      `UPDATE sales_order_detail SET production_status = :status
       WHERE sales_order_number = :son AND line_number = :ln`,
      { replacements: { status: newStatus, son: source_order_number, ln: source_line_number }, ...txOpt }
    );
  } catch (e) {
    log.warn({ error: (e as Error).message }, 'syncProductionStatus跳过');
  }
};

// ==================== 2.5 生产计划状态同步 ====================
// 当生产单状态变更时，同步更新 Production_plan 的 plan_status 和 production_status
// plan_status: 计划自身业务状态（待加入任务/已加入任务/已完成）
// production_status: 关联生产单的进度汇总（未排产/已排产/已备料/生产中/生产完成/NULL）

// 生产单 plan_status → 计划 production_status 映射
const ORDER_TO_PLAN_PRODUCTION_STATUS: Record<string, string> = {
  '未开始': '未排产',
  '已派发': '已排产',
  '已备料': '已备料',
  '生产中': '生产中',
  '已完成': '生产完成',
};

// production_status 优先级排序
const PRODUCTION_STATUS_RANK: Record<string, number> = {
  '未排产': 0, '已排产': 1, '已备料': 2, '生产中': 3, '生产完成': 4,
};

/**
 * 根据生产计划编号，重新计算并同步 plan_status 和 production_status
 * @param productionNumber 生产计划编号（可直接传）
 * @param transaction 可选事务
 */
const recalcAndSyncPlanStatus = async (productionNumber: string, transaction?: any): Promise<void> => {
  const txOpt = transaction ? { transaction } : {};

  // 1. 查询该计划下所有已审批且未取消的生产单
  const [orders]: any = await sequelize.query(
    `SELECT plan_status FROM production_order
     WHERE production_number = :pn AND approval_status = N'已审批' AND plan_status != N'已取消'`,
    { replacements: { pn: productionNumber }, ...txOpt }
  );

  if (orders.length === 0) {
    // 无已审批生产单：plan_status 保持不变（由创建/删除逻辑管理），production_status 置 NULL
    await sequelize.query(
      `UPDATE Production_plan SET production_status = NULL WHERE production_number = :pn`,
      { replacements: { pn: productionNumber }, ...txOpt }
    );
    return;
  }

  // 2. 计算 production_status：取最靠后的状态
  let maxRank = -1;
  let maxStatus: string | null = null;
  for (const o of orders) {
    const mapped = ORDER_TO_PLAN_PRODUCTION_STATUS[o.plan_status];
    if (mapped && (PRODUCTION_STATUS_RANK[mapped] ?? -1) > maxRank) {
      maxRank = PRODUCTION_STATUS_RANK[mapped];
      maxStatus = mapped;
    }
  }

  // 3. 计算 plan_status
  const allCompleted = orders.every((o: any) => o.plan_status === '已完成');
  const newPlanStatus = allCompleted ? '已完成' : '已加入任务';

  // 4. 检测首次进入"已排产"状态，自动生成批次号
  const [prevPlan]: any = await sequelize.query(
    `SELECT production_status, batch_number FROM Production_plan WHERE production_number = :pn`,
    { replacements: { pn: productionNumber }, ...txOpt }
  );
  const prevStatus = prevPlan[0]?.production_status;
  const prevBatchNumber = prevPlan[0]?.batch_number;

  // 当 production_status 首次从 NULL/未排产 变为 已排产或更高，且 batch_number 为空时，生成批次号
  let newBatchNumber = prevBatchNumber || null;
  if (maxStatus && (!prevStatus || prevStatus === '未排产')
      && PRODUCTION_STATUS_RANK[maxStatus] >= PRODUCTION_STATUS_RANK['已排产']
      && !prevBatchNumber) {
    try {
      // 查询计划的 item_number 和 factory_id
      const [planInfo]: any = await sequelize.query(
        `SELECT item_number, factory_id FROM Production_plan WHERE production_number = :pn`,
        { replacements: { pn: productionNumber }, ...txOpt }
      );
      const itemNumber = planInfo[0]?.item_number;
      const factoryId = planInfo[0]?.factory_id;

      // 查询工厂编码
      let factoryCode = '';
      if (factoryId) {
        const [fRows]: any = await sequelize.query(
          `SELECT factory_short FROM factory WHERE id = :fid`,
          { replacements: { fid: factoryId }, ...txOpt }
        );
        factoryCode = fRows[0]?.factory_short || '';
      }

      // 由"产品批次号产生规则"决定生成方式
      const rule = await lookupBatchRule(itemNumber, factoryId, transaction);
      if (rule?.mode === 'B') {
        // 模式B：FB-{production_number}
        newBatchNumber = `FB-${productionNumber}`;
      } else {
        // 模式A（默认）：FB-{日期}-{序号}
        newBatchNumber = await generateBatchNumber('FB', factoryCode, transaction);
      }
      log.info({ productionNumber, batchNumber: newBatchNumber, mode: rule?.mode || 'A' }, '计划派发时自动生成批次号');
    } catch (e) {
      log.warn({ error: (e as Error).message, productionNumber }, '批次号生成跳过');
    }
  }

  // 5. 一次性更新
  await sequelize.query(
    `UPDATE Production_plan SET plan_status = :planStatus, production_status = :prodStatus, batch_number = :bn
     WHERE production_number = :pn AND (plan_status != :planStatus OR production_status != :prodStatus OR production_status IS NULL OR (batch_number IS NULL AND :bn IS NOT NULL))`,
    { replacements: { pn: productionNumber, planStatus: newPlanStatus, prodStatus: maxStatus, bn: newBatchNumber }, ...txOpt }
  );
};

/**
 * 同步生产计划状态（入口函数）
 * @param identifier 生产单编号(production_order_number) 或 生产计划编号(production_number)
 * @param mode 'order'=按生产单编号反查计划 | 'plan'=直接按计划编号
 * @param transaction 可选事务
 */
export const syncPlanStatus = async (
  identifier: string,
  mode: 'order' | 'plan' = 'order',
  transaction?: any
): Promise<void> => {
  try {
    const txOpt = transaction ? { transaction } : {};

    let productionNumber = identifier;
    if (mode === 'order') {
      // 通过生产单编号反查计划编号
      const [planRows]: any = await sequelize.query(
        `SELECT po.production_number FROM production_order po WHERE po.production_order_number = :orderNo`,
        { replacements: { orderNo: identifier }, ...txOpt }
      );
      productionNumber = planRows[0]?.production_number;
      if (!productionNumber) return;
    }

    await recalcAndSyncPlanStatus(productionNumber, transaction);
  } catch (e) {
    log.warn({ error: (e as Error).message, identifier, mode }, 'syncPlanStatus跳过');
  }
};

// ==================== 3. 行状态同步 ====================
// 规则：shipping_status IN ('全部发货','超额发货') → status='已完成'
//        否则若当前已完成则回退为'进行中'
export const syncLineStatus = async (detailId: number, transaction: any): Promise<void> => {
  const [rows]: any = await sequelize.query(
    `SELECT shipping_status, status, sales_order_number
     FROM sales_order_detail WHERE id = :detailId`,
    { replacements: { detailId }, transaction }
  );
  if (rows.length === 0) return;

  const { shipping_status, status, sales_order_number } = rows[0];
  const isFullyShipped = shipping_status === '全部发货' || shipping_status === '超额发货';

  let newStatus = status;
  if (isFullyShipped && status !== '已完成' && status !== '已作废') {
    newStatus = '已完成';
  } else if (!isFullyShipped && status === '已完成') {
    // 发货状态回退，行状态也回退
    newStatus = '进行中';
  }

  if (newStatus !== status) {
    await sequelize.query(
      `UPDATE sales_order_detail SET status = :status WHERE id = :detailId`,
      { replacements: { status: newStatus, detailId }, transaction }
    );

    // 行状态变更后，同步订单头状态
    if (sales_order_number) {
      await syncOrderHeaderStatus(sales_order_number, transaction);
    }
  }
};

// ==================== 4. 订单头状态汇总 ====================
export const syncOrderHeaderStatus = async (salesOrderNumber: string, transaction: any): Promise<void> => {
  try {
    // 查询当前订单头状态
    const [headerRows]: any = await sequelize.query(
      `SELECT order_status FROM sales_order WHERE sales_order_number = :son`,
      { replacements: { son: salesOrderNumber }, transaction }
    );
    if (headerRows.length === 0) return;
    const currentOrderStatus = headerRows[0].order_status;
    // 已取消的订单不做自动流转
    if (currentOrderStatus === '已取消') return;

    // 统计明细行状态
    const [stats]: any = await sequelize.query(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = N'已完成' THEN 1 ELSE 0 END) as completed,
             SUM(CASE WHEN status = N'已作废' THEN 1 ELSE 0 END) as voided
      FROM sales_order_detail WHERE sales_order_number = :son
    `, { replacements: { son: salesOrderNumber }, transaction });

    const total = parseInt(stats[0]?.total) || 0;
    const completed = parseInt(stats[0]?.completed) || 0;
    const voided = parseInt(stats[0]?.voided) || 0;
    if (total === 0) return;

    // 有效行全部已完成（不含作废） → 尝试配置驱动的自动完成
    const activeLines = total - voided;
    if (activeLines > 0 && completed >= activeLines) {
      // 使用配置驱动的自动完成判定
      const result = await checkAndAutoComplete('sales_order', salesOrderNumber, transaction);
      if (!result.completed) {
        // 配置不存在或未启用，回退到原有硬编码逻辑
        if (currentOrderStatus !== '已完成') {
          await sequelize.query(
            `UPDATE sales_order SET order_status = N'已完成' WHERE sales_order_number = :son`,
            { replacements: { son: salesOrderNumber }, transaction }
          );
        }
      }
    } else if (currentOrderStatus === '已完成' && completed < activeLines) {
      // 有行回退，订单也回退
      await sequelize.query(
        `UPDATE sales_order SET order_status = N'生产中' WHERE sales_order_number = :son`,
        { replacements: { son: salesOrderNumber }, transaction }
      );
    }
  } catch (e) {
    log.warn({ error: (e as Error).message }, 'syncOrderHeaderStatus跳过');
  }
};

// ==================== 5. 审批回调：明细状态联动 ====================

/**
 * 销售订单审批通过时：
 * - 将 order_status 设为 '待执行'
 * - 确保所有明细行 status = '未开始'
 */
export const onSalesOrderApproved = async (salesOrderNumber: string): Promise<void> => {
  try {
    // 更新订单头状态
    await sequelize.query(
      `UPDATE sales_order SET order_status = N'待执行' WHERE sales_order_number = :son AND order_status = N'待执行'`,
      { replacements: { son: salesOrderNumber } }
    );
    // 确保明细行状态为“未开始”
    await sequelize.query(
      `UPDATE sales_order_detail SET status = N'未开始' WHERE sales_order_number = :son AND (status IS NULL OR status = N'')`,
      { replacements: { son: salesOrderNumber } }
    );
    log.info({ salesOrderNumber }, '审批通过：明细行状态已同步');
  } catch (e) {
    log.error({ error: (e as Error).message, salesOrderNumber }, 'onSalesOrderApproved failed');
  }
};

/**
 * 销售订单反审时：
 * - 仅当所有明细行均为“未开始”且无下游单据时，将 order_status 重置为 '待执行'，明细行 status 保持 '未开始'
 * - 如果有明细行已推进（已开始生产、已发货等），记录警告日志但不回退
 */
export const onSalesOrderReversed = async (salesOrderNumber: string): Promise<void> => {
  try {
    // 检查是否有明细行已推进（非“未开始”状态）
    const [progressRows]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM sales_order_detail WHERE sales_order_number = :son AND status <> N'未开始'`,
      { replacements: { son: salesOrderNumber } }
    );
    const hasProgress = (parseInt(progressRows[0]?.cnt) || 0) > 0;

    if (hasProgress) {
      log.warn({ salesOrderNumber }, '反审跳过：存在已推进的明细行，不回退明细状态');
      return;
    }

    // 检查是否有已发货或已生产的明细行
    const [downstreamRows]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM sales_order_detail WHERE sales_order_number = :son AND (shipping_status <> N'未申请' OR production_status <> N'未加入计划')`,
      { replacements: { son: salesOrderNumber } }
    );
    const hasDownstream = (parseInt(downstreamRows[0]?.cnt) || 0) > 0;

    if (hasDownstream) {
      log.warn({ salesOrderNumber }, '反审跳过：存在下游单据（发货/生产），不回退明细状态');
      return;
    }

    // 安全回退：订单头状态保持，明细行保持“未开始”
    log.info({ salesOrderNumber }, '反审完成：所有明细行状态未受影响（仍为“未开始”）');
  } catch (e) {
    log.error({ error: (e as Error).message, salesOrderNumber }, 'onSalesOrderReversed failed');
  }
};
