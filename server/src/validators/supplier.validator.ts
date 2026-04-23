import { validateBody } from './index';

// 创建供应商
export const validateCreateSupplier = validateBody([
  { field: 'supplier_number', label: '供应商编号', required: true, maxLength: 50 },
  { field: 'supplier_name', label: '供应商名称', required: true, maxLength: 100 },
]);

// 更新供应商
export const validateUpdateSupplier = validateBody([
  { field: 'supplier_name', label: '供应商名称', required: true, maxLength: 100 },
]);
