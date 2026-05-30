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

// ==================== 原料仓月度报表 ====================

export function getCompletedMaterialStockCounts() {
  return request.get('/material-warehouse/completed-material-stock-counts')
}

export function getMaterialMonthlyReport(params: { count_number: string }) {
  return request.get('/material-warehouse/material-monthly-report', { params })
}

export function getMaterialMonthlyReportByPeriod(params: { warehouse_number: string; accounting_period: string; count_number?: string }) {
  return request.get('/material-warehouse/material-monthly-report-by-period', { params })
}

export function getStockCountsByWarehouse(params: { warehouse_number: string }) {
  return request.get('/material-warehouse/stock-counts-by-warehouse', { params })
}

// ==================== 半成品生产入库单 ====================

export function getSemiInboundOrderList(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/material-warehouse/semi-inbound-orders', { params })
}

export function getSemiInboundOrderDetail(inbound_order_number: string) {
  return request.get(`/material-warehouse/semi-inbound-orders/${inbound_order_number}`)
}

export function withdrawSemiInboundOrder(inbound_order_number: string) {
  return request.post(`/material-warehouse/semi-inbound-orders/${inbound_order_number}/withdraw`)
}

// ==================== 批次库存 ====================

export function getMaterialBatchOptions(params: { item_number: string; warehouse_number: string }) {
  return request.get('/material-warehouse/batch-options', { params })
}

export function getMaterialBatchOptionsBulk(data: { items: Array<{ item_number: string; warehouse_number: string; required_quantity: number }> }) {
  return request.post('/material-warehouse/batch-options-bulk', data)
}

// ==================== 采购退货出库 ====================

export function getReturnOutboundList(params?: { page?: number; limit?: number; search?: string; return_status?: string }) {
  return request.get('/material-warehouse/return-outbound', { params })
}

export function getReturnOutboundDetail(id: string) {
  return request.get(`/material-warehouse/return-outbound/${encodeURIComponent(id)}`)
}

export function executeReturnOutbound(id: string) {
  return request.post(`/material-warehouse/return-outbound/${encodeURIComponent(id)}/execute`)
}
