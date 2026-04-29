/**
 * 报工单服务 - 桶文件
 * 重新导出所有公共API，保持与原 workReport.service.ts 完全兼容的导入路径
 */
export { syncTaskCompletion } from './taskSync';
export { createWorkReport, quickReport, updateWorkReport, deleteWorkReport, completeOrderReport } from './core';
export { onWorkReportApproved, onWorkReportReversed } from './approval';
