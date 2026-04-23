/**
 * 销售预测服务 - 预测消耗与恢复
 * 从 forecast.controller 抽取
 */
import sequelize from '@/config/database'
import { withTransaction } from '@/shared/db/withTransaction'

// ==================== Approval Callbacks (registered in approval.service.ts) ====================
/**
 * Sales Order approval triggers forecast consumption:
 * - onApprove: When a sales order is approved, consume forecast quantities
 *   using a greedy nearest-first algorithm (earliest unexpired forecast first).
 * - onReverse: When approval is reversed, restore all forecast quantities
 *   that were consumed by this order.
 *
 * These callbacks are registered in approval.service.ts as the 'sales_order' module.
 */

export const consumeForecastOnOrderApproval = async (salesOrderNumber: string): Promise<void> => {
  // 1. 获取订单信息
  const [orderRows]: any = await sequelize.query(
    `SELECT customer_number FROM sales_order WHERE sales_order_number = :son`,
    { replacements: { son: salesOrderNumber } }
  );
  if (!orderRows.length) return;
  const customerNumber = orderRows[0].customer_number;

  // 2. 获取订单明细
  const [details]: any = await sequelize.query(
    `SELECT id, item_number, order_quantity, delivery_date FROM sales_order_detail WHERE sales_order_number = :son`,
    { replacements: { son: salesOrderNumber } }
  );
  if (!details.length) return;

  await withTransaction(async (transaction) => {
    for (const detail of details) {
      const deliveryDate = detail.delivery_date || new Date();
      let remainingToConsume = Number(detail.order_quantity) || 0;
      if (remainingToConsume <= 0) continue;

      // 3. 查匹配的已审批预测明细(同客户+同物料+remaining>0)，按就近排序
      const [forecasts]: any = await sequelize.query(`
        SELECT fd.id, fd.forecast_number, fd.remaining_quantity, fd.consumed_quantity, fd.start_date, fd.end_date
        FROM sales_forecast_detail fd
        INNER JOIN sales_forecast f ON f.forecast_number = fd.forecast_number
        WHERE f.customer_number = :customer_number
          AND f.approval_status = N'已审批'
          AND fd.item_number = :item_number
          AND fd.remaining_quantity > 0
        ORDER BY ABS(DATEDIFF(DAY, :delivery_date,
          DATEADD(DAY, DATEDIFF(DAY, fd.start_date, fd.end_date) / 2, fd.start_date))) ASC,
          fd.start_date ASC
      `, {
        replacements: {
          customer_number: customerNumber,
          item_number: detail.item_number,
          delivery_date: deliveryDate
        }, transaction
      });

      // 4. 逐条消耗
      for (const fc of forecasts) {
        if (remainingToConsume <= 0) break;

        const available = Number(fc.remaining_quantity) || 0;
        const consumeQty = Math.min(remainingToConsume, available);

        // 写消耗记录
        await sequelize.query(`
          INSERT INTO forecast_consumption (forecast_detail_id, forecast_number, sales_order_number, sales_order_detail_id, item_number, consumed_quantity, consumed_date, consumed_by)
          VALUES (:forecast_detail_id, :forecast_number, :sales_order_number, :sales_order_detail_id, :item_number, :consumed_quantity, GETDATE(), N'系统自动')
        `, {
          replacements: {
            forecast_detail_id: fc.id,
            forecast_number: fc.forecast_number,
            sales_order_number: salesOrderNumber,
            sales_order_detail_id: detail.id,
            item_number: detail.item_number,
            consumed_quantity: consumeQty
          }, transaction
        });

        // 更新预测明细
        const newConsumed = Number(fc.consumed_quantity) + consumeQty;
        const newRemaining = available - consumeQty;
        const newStatus = newRemaining <= 0 ? '已消耗' : '部分消耗';

        await sequelize.query(`
          UPDATE sales_forecast_detail SET consumed_quantity = :consumed, remaining_quantity = :remaining, consumption_status = :status WHERE id = :id
        `, {
          replacements: { consumed: newConsumed, remaining: newRemaining, status: newStatus, id: fc.id },
          transaction
        });

        remainingToConsume -= consumeQty;
      }
    }
  });
};

// ==================== 订单反审批恢复预测 ====================

export const recoverForecastOnOrderReversal = async (salesOrderNumber: string): Promise<void> => {
  // 1. 查该订单的消耗记录
  const [records]: any = await sequelize.query(
    `SELECT id, forecast_detail_id, consumed_quantity FROM forecast_consumption WHERE sales_order_number = :son`,
    { replacements: { son: salesOrderNumber } }
  );
  if (!records.length) return;

  await withTransaction(async (transaction) => {
    // 2. 逐条恢复
    for (const rec of records) {
      const restoreQty = Number(rec.consumed_quantity) || 0;

      // 恢复预测明细
      const [current]: any = await sequelize.query(
        `SELECT consumed_quantity, remaining_quantity, forecast_quantity FROM sales_forecast_detail WHERE id = :id`,
        { replacements: { id: rec.forecast_detail_id }, transaction }
      );
      if (current.length) {
        const newConsumed = Math.max(0, Number(current[0].consumed_quantity) - restoreQty);
        const newRemaining = Number(current[0].forecast_quantity) - newConsumed;
        const newStatus = newConsumed <= 0 ? '未消耗' : '部分消耗';

        await sequelize.query(`
          UPDATE sales_forecast_detail SET consumed_quantity = :consumed, remaining_quantity = :remaining, consumption_status = :status WHERE id = :id
        `, {
          replacements: { consumed: newConsumed, remaining: newRemaining, status: newStatus, id: rec.forecast_detail_id },
          transaction
        });
      }
    }

    // 3. 删除消耗记录
    await sequelize.query(
      `DELETE FROM forecast_consumption WHERE sales_order_number = :son`,
      { replacements: { son: salesOrderNumber }, transaction }
    );
  });
};
