/**
 * 生产检验事件订阅者
 * 监听 WorkReportCreated 事件，自动创建检验记录
 *
 * 说明：autoCreateInspections 原位于 workReport.service.ts，
 * 现迁移至此，实现报工模块与质量模块的解耦。
 */

import sequelize from '@/config/database';
import { onEvent } from '@/shared/eventBus';
import { EVENT_NAMES, type WorkReportCreatedPayload } from '@/shared/events';
import { createInspectionFromWorkReport } from './productionInspection.controller';

/**
 * 报工后自动创建检验记录
 */
const autoCreateInspections = async (
  taskNo: string,
  wrNumber: string,
  totalQty: number,
  username: string,
  transaction?: any
) => {
  const [taskRows]: any = await sequelize.query(
    `SELECT process_task_number, production_order_number, step_number, standard_process_name, item_number, item_name, specifications, inspect_type, inspect_plan_name, inspect_spec_name, factory_id FROM process_task WHERE process_task_number = :taskNo`,
    { replacements: { taskNo }, transaction }
  );
  if (!taskRows.length) return;
  const t = taskRows[0];

  // 无需检 → 直接标记无需检，跳过创建
  if (t.inspect_type === '无需检' || !t.inspect_type) {
    await sequelize.query(
      `UPDATE process_task SET inspect_status = N'无需检' WHERE process_task_number = :taskNo`,
      { replacements: { taskNo }, transaction }
    );
    return;
  }

  // 自检/专检 → 读取检验方案计算检验数量
  let inspectQty = totalQty;
  if (t.inspect_plan_name) {
    const [planRows]: any = await sequelize.query(
      `SELECT is_full_inspect, is_sampling, sampling_type, sampling_ratio, sampling_quantity FROM inspection_plan WHERE plan_name = :planName`,
      { replacements: { planName: t.inspect_plan_name }, transaction }
    );
    if (planRows.length) {
      const plan = planRows[0];
      if (plan.is_full_inspect !== '是' && plan.is_sampling === '是') {
        if (plan.sampling_type === '按比例') {
          inspectQty = Math.ceil(totalQty * (plan.sampling_ratio || 0) / 100);
        } else if (plan.sampling_type === '按固定数量') {
          inspectQty = Math.min(totalQty, plan.sampling_quantity || 1);
        } else if (plan.sampling_type === '按批次') {
          inspectQty = Math.min(totalQty, plan.sampling_quantity || 1);
        }
        if (inspectQty < 1) inspectQty = 1;
      }
    }
  }

  const num = await createInspectionFromWorkReport({
    work_report_number: wrNumber,
    process_task_number: t.process_task_number,
    production_order_number: t.production_order_number || '',
    step_number: t.step_number,
    standard_process_name: t.standard_process_name || '',
    item_number: t.item_number || '',
    item_name: t.item_name || '',
    specifications: t.specifications || '',
    inspect_type: t.inspect_type,
    inspection_plan_name: t.inspect_plan_name || '',
    inspection_spec_name: t.inspect_spec_name || '',
    total_quantity: inspectQty,
    creation_man: username
  }, '', t.factory_id || null, transaction);

  // 回写工序任务状态
  await sequelize.query(
    `UPDATE process_task SET inspect_status = N'待检验' WHERE process_task_number = :taskNo`,
    { replacements: { taskNo }, transaction }
  );

  console.log(`[报工${wrNumber}] 自动创建检验记录: ${num}`);
};

export const registerProductionInspectionSubscriber = (): void => {
  onEvent(EVENT_NAMES.WORK_REPORT_CREATED, async (payload: WorkReportCreatedPayload) => {
    const { process_task_number, work_report_number, total_quantity, username, transaction } = payload;
    await autoCreateInspections(
      process_task_number,
      work_report_number,
      total_quantity,
      username,
      transaction
    );
  });

  console.log('[EventBus] 生产检验订阅者已注册');
};
