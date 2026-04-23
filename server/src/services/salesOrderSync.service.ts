/**
 * 销售订单状态同步服务
 * 集中管理 sales_order_detail 的 return_status / production_status / status(行状态)
 * 以及 sales_order.order_status 的自动汇总
 */
import sequelize from '@/config/database';

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
    console.log('[syncProductionStatus] 跳过:', (e as Error).message);
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

    // 有效行全部已完成（不含作废） → 订单已完成
    const activeLines = total - voided;
    let newOrderStatus = currentOrderStatus;
    if (activeLines > 0 && completed >= activeLines) {
      newOrderStatus = '已完成';
    } else if (currentOrderStatus === '已完成' && completed < activeLines) {
      // 有行回退，订单也回退
      newOrderStatus = '生产中';
    }

    if (newOrderStatus !== currentOrderStatus) {
      await sequelize.query(
        `UPDATE sales_order SET order_status = :status WHERE sales_order_number = :son`,
        { replacements: { status: newOrderStatus, son: salesOrderNumber }, transaction }
      );
    }
  } catch (e) {
    console.log('[syncOrderHeaderStatus] 跳过:', (e as Error).message);
  }
};
