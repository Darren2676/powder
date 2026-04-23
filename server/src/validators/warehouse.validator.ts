import { validateBody } from './index';

// ==================== 物料仓库 ====================

// 手动入库
export const validateMaterialInbound = validateBody([
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
  { field: 'warehouse_name', label: '仓库名称', maxLength: 100 },
]);

// 生产入库
export const validateMaterialProductionInbound = validateBody([
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
  { field: 'warehouse_name', label: '仓库名称', maxLength: 100 },
]);

// 手动出库
export const validateMaterialOutbound = validateBody([
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
  { field: 'quantity', label: '数量', required: true, type: 'number' },
]);

// 库存调整
export const validateMaterialAdjust = validateBody([
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
  { field: 'adjust_quantity', label: '调整数量', required: true, type: 'number' },
]);

// 安全库存更新
export const validateMaterialSafetyStock = validateBody([
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
]);

// ==================== 成品仓库 ====================

// 成品生产入库
export const validateFinishedGoodsInbound = validateBody([
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
  { field: 'warehouse_name', label: '仓库名称', maxLength: 100 },
]);

// 成品发货出库
export const validateFinishedGoodsOutbound = validateBody([
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
  { field: 'warehouse_name', label: '仓库名称', maxLength: 100 },
]);

// 成品库存调整
export const validateFinishedGoodsAdjust = validateBody([
  { field: 'item_number', label: '产品编号', required: true, maxLength: 100 },
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
  { field: 'adjust_quantity', label: '调整数量', required: true, type: 'number' },
]);

// 成品安全库存更新
export const validateFinishedGoodsSafetyStock = validateBody([
  { field: 'item_number', label: '产品编号', required: true, maxLength: 100 },
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
]);

// 成品退货入库
export const validateFinishedGoodsReturnInbound = validateBody([
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
  { field: 'warehouse_name', label: '仓仓名称', maxLength: 100 },
]);

// ==================== 采购入库 ====================

// 创建采购入库单
export const validateCreateStockIn = validateBody([
  { field: 'purchase_order_number', label: '采购订单号', required: true, maxLength: 50 },
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
]);

// 更新采购入库单
export const validateUpdateStockIn = validateBody([
  { field: 'purchase_order_number', label: '采购订单号', required: true, maxLength: 50 },
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
]);

// ==================== 盘点 ====================

// 创建盘点单
export const validateCreateStockCount = validateBody([
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
  { field: 'count_period', label: '盘点期间', required: true, maxLength: 10 },
  { field: 'count_type', label: '盘点类型', required: true, maxLength: 10 },
]);

// 更新盘点单
export const validateUpdateStockCount = validateBody([]);

// ==================== 异常出入库 ====================

// 创建异常出入库单
export const validateCreateAbnormalIO = validateBody([
  { field: 'type', label: '异常类型', required: true, maxLength: 20 },
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
]);

// 更新异常出入库单
export const validateUpdateAbnormalIO = validateBody([
  { field: 'type', label: '异常类型', required: true, maxLength: 20 },
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
]);
