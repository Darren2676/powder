import { validateBody } from './index';

// 创建生产计划
export const validateCreatePlan = validateBody([
  { field: 'item_number', label: '产品编号', required: true, maxLength: 100 },
]);

// 更新生产计划
export const validateUpdatePlan = validateBody([
  { field: 'item_number', label: '产品编号', required: true, maxLength: 100 },
]);

// 创建主生产计划
export const validateCreateMPS = validateBody([
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
]);

// 更新主生产计划
export const validateUpdateMPS = validateBody([
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
]);

// 创建MRP运算
export const validateCreateMRP = validateBody([
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
]);

// 更新MRP运算
export const validateUpdateMRP = validateBody([
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
]);
