import { validateBody } from './index';

// 创建客户
export const validateCreateCustomer = validateBody([
  { field: 'customer_number', label: '客户编号', required: true, maxLength: 50 },
  { field: 'customer_name', label: '客户名称', required: true, maxLength: 100 },
]);

// 更新客户
export const validateUpdateCustomer = validateBody([
  { field: 'customer_name', label: '客户名称', required: true, maxLength: 100 },
]);
