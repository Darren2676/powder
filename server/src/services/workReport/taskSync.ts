/**
 * 报工单服务 - 工序任务状态同步
 * 从 workReport.service.ts 拆分
 */
import sequelize from '@/config/database';
import { syncProductionStatus } from '@/services/salesOrderSync.service';
import { createLogger } from '@/config/logger';

const log = createLogger('taskSync');

// ==================== 同步更新工序任务完成数量和状态（正数=增加，负数=扣减） ====================

export const syncTaskCompletion = async (taskNo: string, qtyDelta: number, transaction?: any): Promise<void> => {
  if (!taskNo || qtyDelta === 0) return;

  const txOpt = transaction ? { transaction } : {};

  await sequelize.query(
    `UPDATE process_task SET completed_quantity = CASE WHEN completed_quantity + :delta < 0 THEN 0 ELSE completed_quantity + :delta END WHERE process_task_number = :taskNo`,
    { replacements: { delta: qtyDelta, taskNo }, ...txOpt }
  );

  const [tasks]: any = await sequelize.query(
    `SELECT task_status, completed_quantity, planned_quantity FROM process_task WHERE process_task_number = :taskNo`,
    { replacements: { taskNo }, ...txOpt }
  );
  if (!tasks.length) return;
  const task = tasks[0];
  const completedQty = parseFloat(task.completed_quantity) || 0;
  const plannedQty = parseFloat(task.planned_quantity) || 0;

  if (completedQty >= plannedQty && task.task_status !== '已完成' && task.task_status !== '已关闭') {
    await sequelize.query(
      `UPDATE process_task SET task_status = N'已完成' WHERE process_task_number = :taskNo AND task_status NOT IN (N'已完成', N'已关闭')`,
      { replacements: { taskNo }, ...txOpt }
    );
  } else if (completedQty > 0 && completedQty < plannedQty && (task.task_status === '未开始' || task.task_status === '已完成')) {
    await sequelize.query(
      `UPDATE process_task SET task_status = N'进行中' WHERE process_task_number = :taskNo AND task_status IN (N'未开始', N'已完成')`,
      { replacements: { taskNo }, ...txOpt }
    );
  } else if (completedQty <= 0 && task.task_status !== '已关闭') {
    await sequelize.query(
      `UPDATE process_task SET task_status = N'未开始' WHERE process_task_number = :taskNo AND task_status NOT IN (N'已关闭')`,
      { replacements: { taskNo }, ...txOpt }
    );
  }

  // === 自动流转生产单 plan_status ===
  try {
    const [orderRows]: any = await sequelize.query(
      `SELECT production_order_number FROM process_task WHERE process_task_number = :taskNo`,
      { replacements: { taskNo }, ...txOpt }
    );
    const orderNo = orderRows[0]?.production_order_number;
    if (orderNo) {
      // 已备料 -> 生产中（首次报工时）
      if (qtyDelta > 0) {
        await sequelize.query(
          `UPDATE production_order SET plan_status = N'生产中' WHERE production_order_number = :orderNo AND plan_status = N'已备料'`,
          { replacements: { orderNo }, ...txOpt }
        );
        // 回写销售订单明细 production_status
        await syncProductionStatus(orderNo, '生产中', txOpt.transaction);
      }
      // 所有工序都已完成且检验状态合格 -> 生产单标记已完成
      const [pendingTasks]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM process_task WHERE production_order_number = :orderNo AND task_status NOT IN (N'已完成', N'已关闭')`,
        { replacements: { orderNo }, ...txOpt }
      );
      const [pendingInspect]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM process_task WHERE production_order_number = :orderNo AND task_status IN (N'已完成', N'已关闭') AND inspect_status NOT IN (N'检验合格', N'无需检', N'已处理')`,
        { replacements: { orderNo }, ...txOpt }
      );
      if (parseInt(pendingTasks[0]?.cnt) === 0 && parseInt(pendingInspect[0]?.cnt) === 0) {
        await sequelize.query(
          `UPDATE production_order SET plan_status = N'已完成' WHERE production_order_number = :orderNo AND plan_status NOT IN (N'已完成')`,
          { replacements: { orderNo }, ...txOpt }
        );
        // 回写销售订单明细 production_status
        await syncProductionStatus(orderNo, '生产完成', txOpt.transaction);
      }
    }
  } catch (e) { log.warn({ taskNo, qtyDelta, error: e }, 'plan_status流转跳过'); }
};
