import { validateBody } from './index';

// ==================== 缺陷 ====================

// 创建缺陷
export const validateCreateDefect = validateBody([
  { field: 'defect_number', label: '缺陷编号', required: true, maxLength: 50 },
  { field: 'defect_name', label: '缺陷名称', required: true, maxLength: 100 },
]);

// 更新缺陷
export const validateUpdateDefect = validateBody([
  { field: 'defect_name', label: '缺陷名称', required: true, maxLength: 100 },
]);

// ==================== 缺陷分类 ====================

// 创建缺陷分类
export const validateCreateDefectClass = validateBody([
  { field: 'defect_class_number', label: '缺陷分类编号', required: true, maxLength: 50 },
  { field: 'defect_class_name', label: '缺陷分类名称', required: true, maxLength: 100 },
]);

// 更新缺陷分类
export const validateUpdateDefectClass = validateBody([
  { field: 'defect_class_name', label: '缺陷分类名称', required: true, maxLength: 100 },
]);

// ==================== 缺陷原因 ====================

// 创建缺陷原因
export const validateCreateDefectReason = validateBody([
  { field: 'defect_reason_number', label: '缺陷原因编号', required: true, maxLength: 50 },
  { field: 'defect_reason_name', label: '缺陷原因名称', required: true, maxLength: 100 },
]);

// 更新缺陷原因
export const validateUpdateDefectReason = validateBody([
  { field: 'defect_reason_name', label: '缺陷原因名称', required: true, maxLength: 100 },
]);

// ==================== 质量特性 ====================

// 创建质量特性
export const validateCreateQualityCharacteristic = validateBody([
  { field: 'char_name', label: '特性名称', required: true, maxLength: 100 },
  { field: 'data_type', label: '数据类型', required: true, maxLength: 20 },
]);

// 更新质量特性
export const validateUpdateQualityCharacteristic = validateBody([
  { field: 'data_type', label: '数据类型', required: true, maxLength: 20 },
]);

// ==================== 检验规范 ====================

// 创建检验规范
export const validateCreateInspectionSpec = validateBody([
  { field: 'spec_name', label: '规范名称', required: true, maxLength: 100 },
]);

// 更新检验规范
export const validateUpdateInspectionSpec = validateBody([]);

// ==================== 来料检验规范 ====================

// 创建来料检验规范
export const validateCreateIncomingInspectSpec = validateBody([
  { field: 'spec_name', label: '规范名称', required: true, maxLength: 100 },
]);

// 更新来料检验规范
export const validateUpdateIncomingInspectSpec = validateBody([]);

// ==================== 检验方案 ====================

// 创建检验方案
export const validateCreateInspectionPlan = validateBody([
  { field: 'plan_name', label: '方案名称', required: true, maxLength: 100 },
  { field: 'inspect_type', label: '检验类型', required: true, maxLength: 20 },
]);

// 更新检验方案
export const validateUpdateInspectionPlan = validateBody([
  { field: 'inspect_type', label: '检验类型', required: true, maxLength: 20 },
]);

// ==================== 来料检验方案 ====================

// 创建来料检验方案
export const validateCreateIncomingInspectPlan = validateBody([
  { field: 'plan_name', label: '方案名称', required: true, maxLength: 100 },
  { field: 'inspect_method', label: '检验方法', required: true, maxLength: 50 },
]);

// 更新来料检验方案
export const validateUpdateIncomingInspectPlan = validateBody([
  { field: 'inspect_method', label: '检验方法', required: true, maxLength: 50 },
]);

// ==================== 质量报告（来料检验） ====================

// 创建来料检验
export const validateCreatePurchaseInspection = validateBody([
  { field: 'purchase_order_number', label: '采购订单号', required: true, maxLength: 50 },
]);

// 更新来料检验
export const validateUpdatePurchaseInspection = validateBody([
  { field: 'purchase_order_number', label: '采购订单号', required: true, maxLength: 50 },
]);
