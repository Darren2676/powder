/**
 * 报工单服务 - 审批回调
 * 从 workReport.service.ts 拆分
 */

// ==================== Approval Callbacks (registered in approval.service.ts) ====================
/**
 * Design Decision: Why are these callbacks no-ops?
 *
 * The original system performed task completion sync AFTER approval. However, this
 * created a problem: operators couldn't see real-time progress on the shop floor
 * because task completion quantities were only updated after the approval process
 * completed (which could take hours or days).
 *
 * The current design syncs task completion IMMEDIATELY when a work report is created
 * (see createWorkReport/quickReport/completeOrderReport), so by the time the report
 * is approved, the task state is already up-to-date.
 *
 * Therefore:
 * - onWorkReportApproved: No action needed — task completion already synced at creation.
 * - onWorkReportReversed: No action needed — the work report record still exists after
 *   reversal (only the approval_status changes), so the completion quantities remain valid.
 *   Only when a work report is DELETED (deleteWorkReport) are the quantities reversed.
 *
 * If business requirements change to require post-approval actions (e.g., triggering
 * inventory movement only after approval), implement the logic here and the registry
 * in approval.service.ts will automatically dispatch to it.
 */

export const onWorkReportApproved = async (workReportNumber: string): Promise<void> => {
  // No-op: completion already synced at report creation time
};

export const onWorkReportReversed = async (workReportNumber: string): Promise<void> => {
  // No-op: report record persists after reversal, quantities remain valid
};
