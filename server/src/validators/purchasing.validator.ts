import { validateBody } from './index';

// ==================== 采购订单 ====================

// 创建采购订单
export const validateCreatePurchaseOrder = validateBody([
  { field: 'supplier_number', label: '供应商编号', required: true, maxLength: 50 },
]);

// 更新采购订单
export const validateUpdatePurchaseOrder = validateBody([
  { field: 'supplier_number', label: '供应商编号', required: true, maxLength: 50 },
]);

// ==================== 采购运算 ====================

// 需求报表查询
export const validatePurchaseCalcDemand = validateBody([
  { field: 'mfg_bom_number', label: '制造BOM编号', required: true, maxLength: 50 },
  { field: 'planned_quantity', label: '计划数量', required: true, type: 'number' },
]);

// 生成采购申请
export const validateGeneratePurchaseReq = validateBody([
  { field: 'mfg_bom_number', label: '制造BOM编号', required: true, maxLength: 50 },
]);

// ==================== 采购价格表 ====================

// 创建采购价格表
export const validateCreatePurchasePriceList = validateBody([
  { field: 'price_list_name', label: '价格表名称', required: true, maxLength: 100 },
]);

// 更新采购价格表
export const validateUpdatePurchasePriceList = validateBody([
  { field: 'price_list_name', label: '价格表名称', required: true, maxLength: 100 },
]);

// ==================== 计件单价 ====================

// 创建计件单价表
export const validateCreatePieceRatePrice = validateBody([
  { field: 'price_list_name', label: '名称', required: true, maxLength: 100 },
  { field: 'effective_date', label: '生效日期', required: true, maxLength: 20 },
  { field: 'expiration_date', label: '失效日期', required: true, maxLength: 20 },
]);

// 更新计件单价表
export const validateUpdatePieceRatePrice = validateBody([
  { field: 'price_list_name', label: '名称', required: true, maxLength: 100 },
  { field: 'effective_date', label: '生效日期', required: true, maxLength: 20 },
  { field: 'expiration_date', label: '失效日期', required: true, maxLength: 20 },
]);

// ==================== 采购申请 ====================

// 创建采购申请
export const validateCreatePurchaseReq = validateBody([
  { field: 'request_date', label: '申请日期', required: true, maxLength: 20 },
  { field: 'request_department', label: '申请部门', required: true, maxLength: 50 },
  { field: 'requester', label: '申请人', required: true, maxLength: 50 },
]);

// 更新采购申请
export const validateUpdatePurchaseReq = validateBody([
  { field: 'request_date', label: '申请日期', required: true, maxLength: 20 },
  { field: 'request_department', label: '申请部门', required: true, maxLength: 50 },
  { field: 'requester', label: '申请人', required: true, maxLength: 50 },
]);

// 采购申请转订单
export const validatePurchaseReqToOrder = validateBody([
  { field: 'supplier_number', label: '供应商编号', required: true, maxLength: 50 },
  { field: 'detail_ids', label: '明细ID列表', required: true },
]);

// ==================== 标准成本单价 ====================

// 创建标准成本单价表
export const validateCreateStandardCost = validateBody([
  { field: 'cost_list_name', label: '名称', required: true, maxLength: 100 },
  { field: 'effective_date', label: '生效日期', required: true, maxLength: 20 },
  { field: 'expiration_date', label: '失效日期', required: true, maxLength: 20 },
]);

// 更新标准成本单价表
export const validateUpdateStandardCost = validateBody([
  { field: 'cost_list_name', label: '名称', required: true, maxLength: 100 },
  { field: 'effective_date', label: '生效日期', required: true, maxLength: 20 },
  { field: 'expiration_date', label: '失效日期', required: true, maxLength: 20 },
]);
