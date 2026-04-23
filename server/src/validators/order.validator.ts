import { validateBody } from './index';

// 创建销售订单
export const validateCreateSalesOrder = validateBody([
  { field: 'order_number', label: '订单编号', required: true },
  { field: 'customer_number', label: '客户编号', required: true },
  { field: 'order_date', label: '订单日期', required: true },
]);

// 创建生产工单
export const validateCreateOrder = validateBody([
  { field: 'production_order_number', label: '生产单号', required: true },
  { field: 'item_number', label: '物料编号', required: true },
]);

// 创建采购申请
export const validateCreatePurchaseReq = validateBody([
  { field: 'item_number', label: '物料编号', required: true },
  { field: 'required_quantity', label: '需求数量', required: true, type: 'number' },
]);
