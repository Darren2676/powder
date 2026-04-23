import request from '@/utils/request'

// ==================== 物料库存 ====================

export function getInventoryList(params?: { page?: number; limit?: number; search?: string; warehouse_number?: string; item_type?: string }) {
  return request.get('/material-warehouse/inventory', { params })
}

// ==================== 入库管理 ====================

export function manualInbound(data: any) {
  return request.post('/material-warehouse/inbound', data)
}

export function getPendingInbound(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/material-warehouse/pending-inbound', { params })
}

export function productionInbound(data: any) {
  return request.post('/material-warehouse/production-inbound', data)
}

// ==================== 出库管理 ====================

export function manualOutbound(data: any) {
  return request.post('/material-warehouse/outbound', data)
}

// ==================== 库存调整 ====================

export function adjustInventory(data: any) {
  return request.post('/material-warehouse/adjust', data)
}

// ==================== 流水记录 ====================

export function getTransactionList(params?: { page?: number; limit?: number; search?: string; transaction_type?: string; source_type?: string; item_type?: string }) {
  return request.get('/material-warehouse/transactions', { params })
}

// ==================== 安全库存 ====================

export function getSafetyStockAlerts(params?: { page?: number; limit?: number }) {
  return request.get('/material-warehouse/alerts', { params })
}

export function updateSafetyStock(data: { item_number: string; warehouse_number: string; safety_stock_quantity: number }) {
  return request.post('/material-warehouse/safety-stock', data)
}

// ==================== 辅助 ====================

export function getItemOptions(params: { keyword: string; item_type?: string }) {
  return request.get('/material-warehouse/item-options', { params })
}

export function getWarehouseOptions() {
  return request.get('/material-warehouse/warehouse-options')
}
