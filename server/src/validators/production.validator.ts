import { validateBody } from './index';

// 创建工序任务
export const validateCreateProcessTask = validateBody([
  { field: 'production_order_number', label: '生产单号', required: true, maxLength: 50 },
]);

// 更新工序任务
export const validateUpdateProcessTask = validateBody([
  { field: 'production_order_number', label: '生产单号', required: true, maxLength: 50 },
]);

// 创建工序报工
export const validateCreateWorkReport = validateBody([
  { field: 'process_task_number', label: '工序任务编号', required: true, maxLength: 50 },
]);

// 更新工序报工
export const validateUpdateWorkReport = validateBody([
  { field: 'process_task_number', label: '工序任务编号', required: true, maxLength: 50 },
]);

// 创建备料单
export const validateCreateMaterialPreparation = validateBody([
  { field: 'production_order_number', label: '生产单号', required: true, maxLength: 50 },
]);

// 更新备料单
export const validateUpdateMaterialPreparation = validateBody([
  { field: 'production_order_number', label: '生产单号', required: true, maxLength: 50 },
]);

// 创建领料单
export const validateCreateMaterialIssue = validateBody([
  { field: 'preparation_number', label: '备料单号', required: true, maxLength: 50 },
]);

// 更新领料单
export const validateUpdateMaterialIssue = validateBody([
  { field: 'preparation_number', label: '备料单号', required: true, maxLength: 50 },
]);

// 创建委外申请
export const validateCreateOutsourcingReq = validateBody([
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
]);

// 更新委外申请
export const validateUpdateOutsourcingReq = validateBody([
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
]);

// 创建委外订单
export const validateCreateOutsourcingOrder = validateBody([
  { field: 'outsourcing_supplier_number', label: '委外供应商编号', required: true, maxLength: 50 },
]);

// 更新委外订单
export const validateUpdateOutsourcingOrder = validateBody([
  { field: 'outsourcing_supplier_number', label: '委外供应商编号', required: true, maxLength: 50 },
]);

// 创建WIP报告
export const validateCreateWipReport = validateBody([
  { field: 'production_order_number', label: '生产单号', required: true, maxLength: 50 },
]);

// 更新WIP报告
export const validateUpdateWipReport = validateBody([
  { field: 'production_order_number', label: '生产单号', required: true, maxLength: 50 },
]);
