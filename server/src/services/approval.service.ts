/**
 * Approval Service
 * Core business logic for approval workflows, extracted from approval.controller.ts
 * All functions accept plain params and return results — no req/res references.
 */

import sequelize from '@/config/database';
import { BusinessError } from '@/shared/errors/BusinessError';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { hasActiveWorkflow, startWorkflow } from '@/services/workflow.engine';
import { onWorkReportApproved, onWorkReportReversed } from '@/services/workReport.service';
import { consumeForecastOnOrderApproval, recoverForecastOnOrderReversal } from '@/services/forecast.service';
import { onSalesOrderApproved, onSalesOrderReversed } from '@/services/salesOrderSync.service';
import { onStockInApproved, onStockInReversed } from '@/modules/warehouse/stockIn/scrapInventoryHandler';
import { withTransaction } from '@/shared/db/withTransaction';
import { createLogger } from '@/config/logger';

const log = createLogger('approval');

// ==================== Module Registry ====================
const moduleConfig: Record<string, { tableName: string; primaryKey: string; displayName: string }> = {
  'routing_header':  { tableName: 'routing_header',  primaryKey: 'process_route_number',   displayName: '工艺路线' },
  'expense_claim':   { tableName: 'expense_claim',   primaryKey: 'claim_number',              displayName: '报销单' },
  'Production_plan': { tableName: 'Production_plan',  primaryKey: 'production_number',      displayName: '生产计划' },
  'bom_header':      { tableName: 'bom_header',       primaryKey: 'bom_number',             displayName: 'BOM物料清单' },
  'production_order': { tableName: 'production_order', primaryKey: 'production_order_number', displayName: '生产单' },
  'process_task':     { tableName: 'process_task',     primaryKey: 'process_task_number',     displayName: '工序任务单' },
  'material_preparation': { tableName: 'material_preparation', primaryKey: 'preparation_number', displayName: '备料单' },
  'work_report': { tableName: 'work_report', primaryKey: 'work_report_number', displayName: '报工单' },
  'sales_order': { tableName: 'sales_order', primaryKey: 'sales_order_number', displayName: '销售订单' },
  'purchase_req': { tableName: 'purchase_req', primaryKey: 'purchase_req_number', displayName: '采购申请单' },
  'purchase_order': { tableName: 'purchase_order', primaryKey: 'purchase_order_number', displayName: '采购订单' },
  'stock_in': { tableName: 'stock_in', primaryKey: 'stock_in_number', displayName: '入库单' },
  'sales_forecast': { tableName: 'sales_forecast', primaryKey: 'forecast_number', displayName: '销售预测' },
  'return_order': { tableName: 'return_order', primaryKey: 'return_order_number', displayName: '退货单' },
  'mfg_bom_header': { tableName: 'mfg_bom_header', primaryKey: 'mfg_bom_number', displayName: '制造BOM' },
  'purchase_price_list': { tableName: 'purchase_price_list', primaryKey: 'price_list_number', displayName: '采购价目表' },
  'sales_price_list': { tableName: 'sales_price_list', primaryKey: 'price_list_number', displayName: '销售价目表' },
  'outsourcing_order': { tableName: 'outsourcing_order', primaryKey: 'outsourcing_order_number', displayName: '委外订单' },
  'outsourcing_req': { tableName: 'outsourcing_req', primaryKey: 'outsourcing_req_number', displayName: '工序委外申请' },
  'piece_rate_price_header': { tableName: 'piece_rate_price_header', primaryKey: 'price_list_number', displayName: '计件单价表' },
  'standard_cost_header': { tableName: 'standard_cost_header', primaryKey: 'cost_list_number', displayName: '标准成本单价表' },
  'piece_rate_wage_header': { tableName: 'piece_rate_wage_header', primaryKey: 'wage_number', displayName: '计件工资表' },
  'sample_request': { tableName: 'sample_request', primaryKey: 'request_number', displayName: '样品申请' },
  'process_parameter_header': { tableName: 'process_parameter_header', primaryKey: 'parameter_number', displayName: '工艺参数' }
};

export const getModuleConfig = (module: string) => {
  const config = moduleConfig[module];
  if (!config) return null;
  return config;
};

// ==================== Approval Callback Registry ====================
/**
 * Approval Callback Registry Pattern (Phase 3)
 *
 * Design rationale:
 * - Each module that participates in the approval workflow MAY register callbacks
 *   for onApprove (审批通过后) and onReverse (反审后) actions.
 * - Modules with no side-effects on approval/reversal register no-op callbacks
 *   for discoverability — they appear in the registry as "known but no-action" modules.
 * - When a module later needs approval side-effects, replace the no-op with a real
 *   implementation in the module's own service file and re-register here.
 * - This satisfies the Open-Closed Principle: adding approval callbacks for a new
 *   module requires NO changes to the approval service dispatch logic.
 *
 * Callback execution guarantees:
 * - Callbacks run AFTER the approval transaction commits (post-commit hook).
 * - Callback failures are logged but do NOT roll back the approval transaction.
 * - This design prioritizes approval status consistency over callback completeness.
 *   If a callback must be atomic with the approval, it should be invoked INSIDE
 *   the approval transaction in approveCore/reverseApprovalCore instead.
 */

type ApprovalCallback = (recordId: string) => Promise<void>;

interface ApprovalHandlers {
  onApprove?: ApprovalCallback;
  onReverse?: ApprovalCallback;
}

const approvalHandlerRegistry: Record<string, ApprovalHandlers> = {};

export const registerApprovalHandler = (module: string, handlers: ApprovalHandlers): void => {
  approvalHandlerRegistry[module] = {
    ...approvalHandlerRegistry[module],
    ...handlers,
  };
};

/**
 * Check if a module has registered callbacks (for diagnostic purposes)
 */
export const hasApprovalHandler = (module: string): boolean => {
  return module in approvalHandlerRegistry;
};

/**
 * Get all registered modules and their handler keys (for diagnostic/monitoring)
 */
export const getRegisteredModules = (): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  for (const [mod, handlers] of Object.entries(approvalHandlerRegistry)) {
    const keys: string[] = [];
    if (handlers.onApprove) keys.push('onApprove');
    if (handlers.onReverse) keys.push('onReverse');
    result[mod] = keys;
  }
  return result;
};

export const dispatchApprovalCallback = async (
  module: string,
  action: 'onApprove' | 'onReverse',
  recordId: string
): Promise<void> => {
  const handlers = approvalHandlerRegistry[module];

  // Module not registered — log for discoverability
  if (!handlers) {
    log.debug({ module, action, recordId }, 'Module has no registered handlers');
    return;
  }

  const callback = handlers[action];

  // Handler not registered for this action — normal case, no log needed
  if (!callback) return;

  // Execute the callback
  const startTime = Date.now();
  try {
    await callback(recordId);
    const elapsed = Date.now() - startTime;
    if (elapsed > 100) {
      log.warn({ module, action, recordId, elapsed }, 'Slow callback');
    }
  } catch (e) {
    log.error({ module, action, recordId, e }, 'Callback failed');
  }
};

// ==================== No-op Callback Template ====================
/**
 * Creates a no-op callback that logs a debug message when invoked.
 * Use this for modules that currently have no side-effects on approval/reversal
 * but should be discoverable in the registry.
 */
const noopCallback = (module: string, action: string): ApprovalCallback => {
  return async (_recordId: string): Promise<void> => {
    // No side-effect by design. Replace with real implementation when needed.
  };
};

// ==================== Register Module Callbacks ====================
// Modules with real business logic callbacks:
registerApprovalHandler('work_report', { onApprove: onWorkReportApproved, onReverse: onWorkReportReversed });
registerApprovalHandler('sales_order', {
  onApprove: async (recordId: string) => {
    await consumeForecastOnOrderApproval(recordId);
    await onSalesOrderApproved(recordId);
  },
  onReverse: async (recordId: string) => {
    await recoverForecastOnOrderReversal(recordId);
    await onSalesOrderReversed(recordId);
  }
});

// Modules with no-op callbacks (no side-effects on approval/reversal yet).
// When a module needs approval side-effects, replace the no-op with a real
// implementation in the module's service file and update the registration here.
registerApprovalHandler('routing_header', { onApprove: noopCallback('routing_header', 'onApprove'), onReverse: noopCallback('routing_header', 'onReverse') });
registerApprovalHandler('expense_claim', { onApprove: noopCallback('expense_claim', 'onApprove'), onReverse: noopCallback('expense_claim', 'onReverse') });
registerApprovalHandler('Production_plan', { onApprove: noopCallback('Production_plan', 'onApprove'), onReverse: noopCallback('Production_plan', 'onReverse') });
registerApprovalHandler('bom_header', { onApprove: noopCallback('bom_header', 'onApprove'), onReverse: noopCallback('bom_header', 'onReverse') });
registerApprovalHandler('production_order', { onApprove: noopCallback('production_order', 'onApprove'), onReverse: noopCallback('production_order', 'onReverse') });
registerApprovalHandler('process_task', { onApprove: noopCallback('process_task', 'onApprove'), onReverse: noopCallback('process_task', 'onReverse') });
registerApprovalHandler('material_preparation', { onApprove: noopCallback('material_preparation', 'onApprove'), onReverse: noopCallback('material_preparation', 'onReverse') });
registerApprovalHandler('purchase_req', { onApprove: noopCallback('purchase_req', 'onApprove'), onReverse: noopCallback('purchase_req', 'onReverse') });
registerApprovalHandler('purchase_order', { onApprove: noopCallback('purchase_order', 'onApprove'), onReverse: noopCallback('purchase_order', 'onReverse') });
registerApprovalHandler('stock_in', { onApprove: onStockInApproved, onReverse: onStockInReversed });
registerApprovalHandler('sales_forecast', { onApprove: noopCallback('sales_forecast', 'onApprove'), onReverse: noopCallback('sales_forecast', 'onReverse') });
registerApprovalHandler('return_order', { onApprove: noopCallback('return_order', 'onApprove'), onReverse: noopCallback('return_order', 'onReverse') });
registerApprovalHandler('mfg_bom_header', { onApprove: noopCallback('mfg_bom_header', 'onApprove'), onReverse: noopCallback('mfg_bom_header', 'onReverse') });
registerApprovalHandler('purchase_price_list', { onApprove: noopCallback('purchase_price_list', 'onApprove'), onReverse: noopCallback('purchase_price_list', 'onReverse') });
registerApprovalHandler('sales_price_list', { onApprove: noopCallback('sales_price_list', 'onApprove'), onReverse: noopCallback('sales_price_list', 'onReverse') });
registerApprovalHandler('outsourcing_order', { onApprove: noopCallback('outsourcing_order', 'onApprove'), onReverse: noopCallback('outsourcing_order', 'onReverse') }); // replaced by real handler in outsourcingOrder.controller.ts
registerApprovalHandler('outsourcing_req', { onApprove: noopCallback('outsourcing_req', 'onApprove'), onReverse: noopCallback('outsourcing_req', 'onReverse') });
registerApprovalHandler('piece_rate_price_header', { onApprove: noopCallback('piece_rate_price_header', 'onApprove'), onReverse: noopCallback('piece_rate_price_header', 'onReverse') });
registerApprovalHandler('standard_cost_header', { onApprove: noopCallback('standard_cost_header', 'onApprove'), onReverse: noopCallback('standard_cost_header', 'onReverse') });
registerApprovalHandler('piece_rate_wage_header', { onApprove: noopCallback('piece_rate_wage_header', 'onApprove'), onReverse: noopCallback('piece_rate_wage_header', 'onReverse') });
registerApprovalHandler('sample_request', { onApprove: noopCallback('sample_request', 'onApprove'), onReverse: noopCallback('sample_request', 'onReverse') });

// ==================== Submit for Approval ====================
export const submitForApprovalCore = async (params: {
  module: string; recordId: string; userId: number; username: string; remark?: string;
}): Promise<{ usedWorkflow: boolean; instanceId?: string }> => {
  const { module, recordId, userId, username, remark } = params;
  const config = getModuleConfig(module);
  if (!config) throw new BusinessError(400, '无效的模块标识');
  if (!recordId) throw new BusinessError(400, '记录ID不能为空');

  // Check if module has active workflow definition — if yes, delegate to workflow engine
  const useWorkflow = await hasActiveWorkflow(module);
  if (useWorkflow) {
    const result = await startWorkflow(module, recordId, { id: userId, username });
    if (result.success) {
      // Also insert approval_log for compatibility
      await sequelize.query(
        `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'submit', N'草稿', N'审批中', :operator_id, :operator_name, :remark)`,
        { replacements: { module, record_id: recordId, operator_id: userId, operator_name: username, remark: remark || null } }
      );
      return { usedWorkflow: true, instanceId: String(result.instanceId) };
    } else {
      throw new BusinessError(400, result.message);
    }
  }

  // Fallback: old simple approval flow
  return await withTransaction(async (transaction) => {
    // Check current status with optimistic lock
    const [rows]: any = await sequelize.query(
      `UPDATE ${config.tableName} SET approval_status = N'待审批' WHERE ${config.primaryKey} = :record_id AND approval_status = N'草稿'`,
      { replacements: { record_id: recordId }, transaction }
    );
    const affected = (rows as any)?.length !== undefined ? (rows as any).length : ((rows as any)?.rowCount ?? (rows as any)?.[0]?.affectedRows ?? 1);
    // MSSQL returns metadata; check via re-query
    const [check]: any = await sequelize.query(
      `SELECT approval_status FROM ${config.tableName} WHERE ${config.primaryKey} = :record_id`,
      { replacements: { record_id: recordId }, transaction }
    );
    if (!check.length) throw new BusinessError(404, '记录不存在');
    if (check[0].approval_status !== '待审批') throw new BusinessError(400, '当前状态不允许提交审批，只有草稿状态可以提交');

    // Insert approval log
    await sequelize.query(
      `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'submit', N'草稿', N'待审批', :operator_id, :operator_name, :remark)`,
      { replacements: { module, record_id: recordId, operator_id: userId, operator_name: username, remark: remark || null }, transaction }
    );

    // Notify managers and admins
    const [managers]: any = await sequelize.query(
      `SELECT id, username FROM users WHERE role IN ('manager', 'admin') AND status = 'active'`,
      { transaction }
    );
    for (const mgr of managers) {
      await sequelize.query(
        `INSERT INTO notifications (user_id, type, title, content, is_read, created_at) VALUES (:user_id, 'approval_pending', :title, :content, 0, GETDATE())`,
        { replacements: { user_id: mgr.id, title: `${config.displayName}待审批`, content: `${username} 提交了${config.displayName} [${recordId}] 的审批申请` }, transaction }
      );
    }

    return { usedWorkflow: false };
  });
};

// ==================== Approve ====================
export const approveCore = async (params: {
  module: string; recordId: string; userId: number; username: string; remark?: string;
}): Promise<void> => {
  const { module, recordId, userId, username, remark } = params;
  const config = getModuleConfig(module);
  if (!config) throw new BusinessError(400, '无效的模块标识');
  if (!recordId) throw new BusinessError(400, '记录ID不能为空');

  await withTransaction(async (transaction) => {
    // Update with optimistic lock
    await sequelize.query(
      `UPDATE ${config.tableName} SET approval_status = N'已审批' WHERE ${config.primaryKey} = :record_id AND approval_status = N'待审批'`,
      { replacements: { record_id: recordId }, transaction }
    );
    const [check]: any = await sequelize.query(
      `SELECT approval_status FROM ${config.tableName} WHERE ${config.primaryKey} = :record_id`,
      { replacements: { record_id: recordId }, transaction }
    );
    if (!check.length) throw new BusinessError(404, '记录不存在');
    if (check[0].approval_status !== '已审批') throw new BusinessError(400, '当前状态不允许审批，只有待审批状态可以审批');

    // Insert approval log
    await sequelize.query(
      `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'approve', N'待审批', N'已审批', :operator_id, :operator_name, :remark)`,
      { replacements: { module, record_id: recordId, operator_id: userId, operator_name: username, remark: remark || null }, transaction }
    );

    // Notify the submitter
    const [submitLog]: any = await sequelize.query(
      `SELECT TOP 1 operator_id, operator_name FROM approval_log WHERE module = :module AND record_id = :record_id AND action = 'submit' ORDER BY created_at DESC`,
      { replacements: { module, record_id: recordId }, transaction }
    );
    if (submitLog.length) {
      await sequelize.query(
        `INSERT INTO notifications (user_id, type, title, content, is_read, created_at) VALUES (:user_id, 'approval_result', :title, :content, 0, GETDATE())`,
        { replacements: { user_id: submitLog[0].operator_id, title: `${config.displayName}审批通过`, content: `${username} 审批通过了${config.displayName} [${recordId}]` }, transaction }
      );
    }
  }, {
    afterCommit: async () => {
      // Dispatch approval callback via registry
      await dispatchApprovalCallback(module, 'onApprove', recordId);
    }
  });
};

// ==================== Reverse Approval ====================
export const reverseApprovalCore = async (params: {
  module: string; recordId: string; userId: number; username: string; remark?: string;
}): Promise<void> => {
  const { module, recordId, userId, username, remark } = params;
  const config = getModuleConfig(module);
  if (!config) throw new BusinessError(400, '无效的模块标识');
  if (!recordId) throw new BusinessError(400, '记录ID不能为空');

  await withTransaction(async (transaction) => {
    await sequelize.query(
      `UPDATE ${config.tableName} SET approval_status = N'草稿' WHERE ${config.primaryKey} = :record_id AND approval_status = N'已审批'`,
      { replacements: { record_id: recordId }, transaction }
    );
    const [check]: any = await sequelize.query(
      `SELECT approval_status FROM ${config.tableName} WHERE ${config.primaryKey} = :record_id`,
      { replacements: { record_id: recordId }, transaction }
    );
    if (!check.length) throw new BusinessError(404, '记录不存在');
    if (check[0].approval_status !== ORDER_STATUS.DRAFT) throw new BusinessError(400, '当前状态不允许反审，只有已审批状态可以反审');

    await sequelize.query(
      `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'reverse', N'已审批', N'草稿', :operator_id, :operator_name, :remark)`,
      { replacements: { module, record_id: recordId, operator_id: userId, operator_name: username, remark: remark || null }, transaction }
    );

    // Notify original creator
    const [submitLog]: any = await sequelize.query(
      `SELECT TOP 1 operator_id FROM approval_log WHERE module = :module AND record_id = :record_id AND action = 'submit' ORDER BY created_at DESC`,
      { replacements: { module, record_id: recordId }, transaction }
    );
    let notifyUserId = submitLog.length ? submitLog[0].operator_id : null;

    // 同步更新工作流实例状态（适用于通过工作流系统提交审批的模块）
    const [wfInstances]: any = await sequelize.query(
      `SELECT TOP 1 id, initiator_id, title FROM workflow_instances WHERE module = :module AND record_id = :record_id AND status = N'completed' ORDER BY id DESC`,
      { replacements: { module, record_id: recordId }, transaction }
    );
    if (wfInstances.length > 0) {
      const wfInst = wfInstances[0];
      await sequelize.query(
        `UPDATE workflow_instances SET status = N'reversed', completed_at = GETDATE() WHERE id = :id`,
        { replacements: { id: wfInst.id }, transaction }
      );
      await sequelize.query(
        `INSERT INTO workflow_history (instance_id, action, from_status, to_status, operator_id, operator_name, remark, created_at) VALUES (:instanceId, N'reverse', N'completed', N'reversed', :operatorId, :operatorName, :remark, GETDATE())`,
        { replacements: { instanceId: wfInst.id, operatorId: userId, operatorName: username, remark: remark || '反审退回' }, transaction }
      );
      // 优先使用工作流发起人作为通知对象
      if (!notifyUserId) notifyUserId = wfInst.initiator_id;
    }

    if (notifyUserId) {
      await sequelize.query(
        `INSERT INTO notifications (user_id, type, title, content, is_read, created_at) VALUES (:user_id, 'approval_result', :title, :content, 0, GETDATE())`,
        { replacements: { user_id: notifyUserId, title: `${config.displayName}已反审`, content: `${username} 对${config.displayName} [${recordId}] 执行了反审操作，已退回草稿` }, transaction }
      );
    }
  }, {
    afterCommit: async () => {
      // Dispatch reversal callback via registry
      await dispatchApprovalCallback(module, 'onReverse', recordId);
    }
  });
};

// ==================== Withdraw ====================
export const withdrawCore = async (params: {
  module: string; recordId: string; userId: number; username: string;
}): Promise<void> => {
  const { module, recordId, userId, username } = params;
  const config = getModuleConfig(module);
  if (!config) throw new BusinessError(400, '无效的模块标识');
  if (!recordId) throw new BusinessError(400, '记录ID不能为空');

  // Verify the current user is the submitter
  const [submitLog]: any = await sequelize.query(
    `SELECT TOP 1 operator_id FROM approval_log WHERE module = :module AND record_id = :record_id AND action = 'submit' ORDER BY created_at DESC`,
    { replacements: { module, record_id: recordId } }
  );
  if (!submitLog.length || submitLog[0].operator_id !== userId) {
    throw new BusinessError(403, '只有提交人可以撤回');
  }

  await withTransaction(async (transaction) => {
    await sequelize.query(
      `UPDATE ${config.tableName} SET approval_status = N'草稿' WHERE ${config.primaryKey} = :record_id AND approval_status = N'待审批'`,
      { replacements: { record_id: recordId }, transaction }
    );
    const [check]: any = await sequelize.query(
      `SELECT approval_status FROM ${config.tableName} WHERE ${config.primaryKey} = :record_id`,
      { replacements: { record_id: recordId }, transaction }
    );
    if (!check.length) throw new BusinessError(404, '记录不存在');
    if (check[0].approval_status !== ORDER_STATUS.DRAFT) throw new BusinessError(400, '当前状态不允许撤回，只有待审批状态可以撤回');

    await sequelize.query(
      `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'withdraw', N'待审批', N'草稿', :operator_id, :operator_name, NULL)`,
      { replacements: { module, record_id: recordId, operator_id: userId, operator_name: username }, transaction }
    );
  });
};

// ==================== Batch Submit ====================
export const batchSubmitCore = async (params: {
  module: string; recordIds: string[]; userId: number; username: string;
}): Promise<{ succeeded: string[]; failed: { recordId: string; message: string }[] }> => {
  const { module, recordIds, userId, username } = params;
  const config = getModuleConfig(module);
  if (!config) throw new BusinessError(400, '无效的模块标识');
  if (!Array.isArray(recordIds) || recordIds.length === 0) throw new BusinessError(400, 'record_ids 不能为空');

  const results: { succeeded: string[]; failed: { recordId: string; message: string }[] } = { succeeded: [], failed: [] };

  // Check if module has active workflow
  const useWorkflow = await hasActiveWorkflow(module);

  for (const recordId of recordIds) {
    try {
      if (useWorkflow) {
        const result = await startWorkflow(module, recordId, { id: userId, username });
        if (result.success) {
          await sequelize.query(
            `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'submit', N'草稿', N'审批中', :operator_id, :operator_name, N'批量提交')`,
            { replacements: { module, record_id: recordId, operator_id: userId, operator_name: username } }
          );
          results.succeeded.push(recordId);
        } else {
          results.failed.push({ recordId, message: result.message });
        }
      } else {
        await withTransaction(async (transaction) => {
          await sequelize.query(
            `UPDATE ${config.tableName} SET approval_status = N'待审批' WHERE ${config.primaryKey} = :record_id AND approval_status = N'草稿'`,
            { replacements: { record_id: recordId }, transaction }
          );
          const [check]: any = await sequelize.query(
            `SELECT approval_status FROM ${config.tableName} WHERE ${config.primaryKey} = :record_id`,
            { replacements: { record_id: recordId }, transaction }
          );
          if (!check.length) throw new BusinessError(404, '记录不存在');
          if (check[0].approval_status !== '待审批') throw new BusinessError(400, '状态不是草稿，无法提交');

          await sequelize.query(
            `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'submit', N'草稿', N'待审批', :operator_id, :operator_name, N'批量提交')`,
            { replacements: { module, record_id: recordId, operator_id: userId, operator_name: username }, transaction }
          );
        });
        results.succeeded.push(recordId);
      }
    } catch (e) {
      if (e instanceof BusinessError) {
        results.failed.push({ recordId, message: e.message });
      } else {
        results.failed.push({ recordId, message: '系统错误' });
      }
    }
  }

  // Send one notification for all succeeded records (only for non-workflow, workflow engine sends its own)
  if (!useWorkflow && results.succeeded.length > 0) {
    try {
      const [managers]: any = await sequelize.query(`SELECT id FROM users WHERE role IN ('manager', 'admin') AND status = 'active'`);
      for (const mgr of managers) {
        await sequelize.query(
          `INSERT INTO notifications (user_id, type, title, content, is_read, created_at) VALUES (:user_id, 'approval_pending', :title, :content, 0, GETDATE())`,
          { replacements: { user_id: mgr.id, title: `${config.displayName}批量待审批`, content: `${username} 批量提交了 ${results.succeeded.length} 条${config.displayName}的审批申请` } }
        );
      }
    } catch (e) { log.error({ error: e }, '批量提交通知失败'); }
  }

  return results;
};

// ==================== Batch Approve ====================
export const batchApproveCore = async (params: {
  module: string; recordIds: string[]; userId: number; username: string;
}): Promise<{ succeeded: string[]; failed: { recordId: string; message: string }[] }> => {
  const { module, recordIds, userId, username } = params;
  const config = getModuleConfig(module);
  if (!config) throw new BusinessError(400, '无效的模块标识');
  if (!Array.isArray(recordIds) || recordIds.length === 0) throw new BusinessError(400, 'record_ids 不能为空');

  const results: { succeeded: string[]; failed: { recordId: string; message: string }[] } = { succeeded: [], failed: [] };

  for (const recordId of recordIds) {
    try {
      await withTransaction(async (transaction) => {
        await sequelize.query(
          `UPDATE ${config.tableName} SET approval_status = N'已审批' WHERE ${config.primaryKey} = :record_id AND approval_status = N'待审批'`,
          { replacements: { record_id: recordId }, transaction }
        );
        const [check]: any = await sequelize.query(
          `SELECT approval_status FROM ${config.tableName} WHERE ${config.primaryKey} = :record_id`,
          { replacements: { record_id: recordId }, transaction }
        );
        if (!check.length) throw new BusinessError(404, '记录不存在');
        if (check[0].approval_status !== '已审批') throw new BusinessError(400, '状态不是待审批，无法审批');

        await sequelize.query(
          `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'approve', N'待审批', N'已审批', :operator_id, :operator_name, N'批量审批')`,
          { replacements: { module, record_id: recordId, operator_id: userId, operator_name: username }, transaction }
        );
      }, {
        afterCommit: async () => {
          // Dispatch approval callback via registry
          await dispatchApprovalCallback(module, 'onApprove', recordId);
        }
      });
      results.succeeded.push(recordId);
    } catch (e) {
      if (e instanceof BusinessError) {
        results.failed.push({ recordId, message: e.message });
      } else {
        results.failed.push({ recordId, message: '系统错误' });
      }
    }
  }

  return results;
};

// ==================== Batch Withdraw ====================
export const batchWithdrawCore = async (params: {
  module: string; recordIds: string[]; userId: number; username: string;
}): Promise<{ succeeded: string[]; failed: { recordId: string; message: string }[] }> => {
  const { module, recordIds, userId, username } = params;
  const config = getModuleConfig(module);
  if (!config) throw new BusinessError(400, '无效的模块标识');
  if (!Array.isArray(recordIds) || recordIds.length === 0) throw new BusinessError(400, 'record_ids 不能为空');

  const results: { succeeded: string[]; failed: { recordId: string; message: string }[] } = { succeeded: [], failed: [] };

  for (const recordId of recordIds) {
    // Verify submitter
    const [submitLog]: any = await sequelize.query(
      `SELECT TOP 1 operator_id FROM approval_log WHERE module = :module AND record_id = :record_id AND action = 'submit' ORDER BY created_at DESC`,
      { replacements: { module, record_id: recordId } }
    );
    if (!submitLog.length || submitLog[0].operator_id !== userId) {
      results.failed.push({ recordId, message: '只有提交人可以撤回' }); continue;
    }

    try {
      await withTransaction(async (transaction) => {
        await sequelize.query(
          `UPDATE ${config.tableName} SET approval_status = N'草稿' WHERE ${config.primaryKey} = :record_id AND approval_status = N'待审批'`,
          { replacements: { record_id: recordId }, transaction }
        );
        const [check]: any = await sequelize.query(
          `SELECT approval_status FROM ${config.tableName} WHERE ${config.primaryKey} = :record_id`,
          { replacements: { record_id: recordId }, transaction }
        );
        if (!check.length) throw new BusinessError(404, '记录不存在');
        if (check[0].approval_status !== ORDER_STATUS.DRAFT) throw new BusinessError(400, '状态不是待审批，无法撤回');

        await sequelize.query(
          `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'withdraw', N'待审批', N'草稿', :operator_id, :operator_name, N'批量撤回')`,
          { replacements: { module, record_id: recordId, operator_id: userId, operator_name: username }, transaction }
        );
      });
      results.succeeded.push(recordId);
    } catch (e) {
      if (e instanceof BusinessError) {
        results.failed.push({ recordId, message: e.message });
      } else {
        results.failed.push({ recordId, message: '系统错误' });
      }
    }
  }

  return results;
};

// ==================== Batch Reverse ====================
export const batchReverseCore = async (params: {
  module: string; recordIds: string[]; userId: number; username: string;
}): Promise<{ succeeded: string[]; failed: { recordId: string; message: string }[] }> => {
  const { module, recordIds, userId, username } = params;
  const config = getModuleConfig(module);
  if (!config) throw new BusinessError(400, '无效的模块标识');
  if (!Array.isArray(recordIds) || recordIds.length === 0) throw new BusinessError(400, 'record_ids 不能为空');

  const results: { succeeded: string[]; failed: { recordId: string; message: string }[] } = { succeeded: [], failed: [] };

  for (const recordId of recordIds) {
    try {
      await withTransaction(async (transaction) => {
        await sequelize.query(
          `UPDATE ${config.tableName} SET approval_status = N'草稿' WHERE ${config.primaryKey} = :record_id AND approval_status = N'已审批'`,
          { replacements: { record_id: recordId }, transaction }
        );
        const [check]: any = await sequelize.query(
          `SELECT approval_status FROM ${config.tableName} WHERE ${config.primaryKey} = :record_id`,
          { replacements: { record_id: recordId }, transaction }
        );
        if (!check.length) throw new BusinessError(404, '记录不存在');
        if (check[0].approval_status !== ORDER_STATUS.DRAFT) throw new BusinessError(400, '状态不是已审批，无法反审');

        await sequelize.query(
          `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'reverse', N'已审批', N'草稿', :operator_id, :operator_name, N'批量反审')`,
          { replacements: { module, record_id: recordId, operator_id: userId, operator_name: username }, transaction }
        );
      }, {
        afterCommit: async () => {
          // Dispatch reversal callback via registry
          await dispatchApprovalCallback(module, 'onReverse', recordId);
        }
      });
      results.succeeded.push(recordId);
    } catch (e) {
      if (e instanceof BusinessError) {
        results.failed.push({ recordId, message: e.message });
      } else {
        results.failed.push({ recordId, message: '系统错误' });
      }
    }
  }

  return results;
};

// ==================== Get Pending Approvals ====================
export const getPendingApprovalsCore = async (params: {
  page: number; limit: number; statusFilter: string;
}): Promise<{ items: any[]; total: number; page: number; limit: number }> => {
  const { page, limit, statusFilter } = params;

  const allItems: any[] = [];

  for (const [moduleName, config] of Object.entries(moduleConfig)) {
    try {
      let statusCondition = '';
      if (statusFilter === 'pending') {
        statusCondition = `WHERE approval_status = N'待审批'`;
      } else if (statusFilter === 'completed') {
        statusCondition = `WHERE approval_status = N'已审批'`;
      } else {
        statusCondition = `WHERE approval_status IN (N'待审批', N'已审批')`;
      }

      const [rows]: any = await sequelize.query(
        `SELECT ${config.primaryKey} as record_id, approval_status FROM ${config.tableName} ${statusCondition}`
      );

      for (const row of rows) {
        // 查找最新的审批日志获取提交人和时间
        const [logRows]: any = await sequelize.query(
          `SELECT TOP 1 operator_name, remark, created_at FROM approval_log WHERE module = :module AND record_id = :record_id ORDER BY id DESC`,
          { replacements: { module: moduleName, record_id: row.record_id } }
        );
        const log = logRows[0] || {};

        allItems.push({
          module: moduleName,
          module_name: config.displayName,
          record_id: row.record_id,
          approval_status: row.approval_status,
          submitter: log.operator_name || '',
          submit_time: log.created_at || null,
          remark: log.remark || ''
        });
      }
    } catch { /* 表可能不存在，跳过 */ }
  }

  // 按提交时间降序排序
  allItems.sort((a, b) => {
    const ta = a.submit_time ? new Date(a.submit_time).getTime() : 0;
    const tb = b.submit_time ? new Date(b.submit_time).getTime() : 0;
    return tb - ta;
  });

  const total = allItems.length;
  const offset = (page - 1) * limit;
  const items = allItems.slice(offset, offset + limit);

  return { items, total, page, limit };
};
