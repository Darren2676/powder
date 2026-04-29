/**
 * 报工单服务 - 桶导出（向后兼容）
 * 业务逻辑已拆分至 workReport/ 子目录：
 *   - taskSync.ts  工序任务状态同步
 *   - core.ts      核心CRUD操作（创建/快速报工/编辑/删除/完成生产单）
 *   - approval.ts  审批回调
 */
export { syncTaskCompletion } from './workReport/taskSync';
export { createWorkReport, quickReport, updateWorkReport, deleteWorkReport, completeOrderReport } from './workReport/core';
export { onWorkReportApproved, onWorkReportReversed } from './workReport/approval';
