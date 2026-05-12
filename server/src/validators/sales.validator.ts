import { validateBody } from './index';

// 创建销售价目表
export const validateCreateSalesPrice = validateBody([
  { field: 'price_list_name', label: '价目表名称', required: true, maxLength: 100 },
]);

// 更新销售价目表
export const validateUpdateSalesPrice = validateBody([
  { field: 'price_list_name', label: '价目表名称', required: true, maxLength: 100 },
]);

// 新建销售预测（item_number 在 details 数组内，controller 单独校验）
export const validateCreateForecast = validateBody([
  { field: 'customer_number', label: '客户编号', required: true, maxLength: 50 },
]);

// 更新销售预测
export const validateUpdateForecast = validateBody([
  { field: 'customer_number', label: '客户编号', required: true, maxLength: 50 },
]);

// 创建发货申请（item_number 在 details 数组内，controller 单独校验）
export const validateCreateShippingRequest = validateBody([
  { field: 'customer_number', label: '客户编号', required: true, maxLength: 50 },
]);

// 更新发货申请
export const validateUpdateShippingRequest = validateBody([
  { field: 'customer_number', label: '客户编号', required: true, maxLength: 50 },
]);

// 创建发货单
export const validateCreateShippingOrder = validateBody([
  { field: 'customer_number', label: '客户编号', required: true, maxLength: 50 },
]);

// 更新发货单
export const validateUpdateShippingOrder = validateBody([
  { field: 'customer_number', label: '客户编号', required: true, maxLength: 50 },
]);

// 创建退货单
export const validateCreateReturnOrder = validateBody([
  { field: 'shipping_order_number', label: '发货单号', required: true, maxLength: 50 },
]);

// 更新退货单
export const validateUpdateReturnOrder = validateBody([
  { field: 'shipping_order_number', label: '发货单号', required: true, maxLength: 50 },
]);
