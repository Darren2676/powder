import { validateBody } from './index';

// ==================== 设备 ====================

// 创建设备
export const validateCreateEquipment = validateBody([
  { field: 'equipment_number', label: '设备编号', required: true, maxLength: 50 },
  { field: 'equipment_name', label: '设备名称', required: true, maxLength: 100 },
]);

// 更新设备
export const validateUpdateEquipment = validateBody([
  { field: 'equipment_number', label: '设备编号', required: true, maxLength: 50 },
  { field: 'equipment_name', label: '设备名称', required: true, maxLength: 100 },
]);

// ==================== 模具 ====================

// 创建模具
export const validateCreateMould = validateBody([
  { field: 'item_number', label: '模具编号', required: true, maxLength: 100 },
  { field: 'item_name', label: '模具名称', required: true, maxLength: 100 },
]);

// 更新模具
export const validateUpdateMould = validateBody([
  { field: 'item_name', label: '模具名称', required: true, maxLength: 100 },
]);
