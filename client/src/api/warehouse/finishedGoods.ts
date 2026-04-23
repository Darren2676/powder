import request from '@/utils/request'

// ==================== 成品库存 ====================

export function getInventoryList(params?: { page?: number; limit?: number; search?: string; warehouse_number?: string; quality_status?: string }) {
  return request.get('/finished-goods/inventory', { params })
}

export function getInventoryDetail(params: { item_number: string; warehouse_number?: string }) {
  return request.get('/finished-goods/inventory/detail', { params })
}

// ==================== 入库管理 ====================

export function getPendingInbound(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/finished-goods/pending-inbound', { params })
}

export function productionInbound(data: any) {
  return request.post('/finished-goods/inbound', data)
}

// ==================== 出库管理 ====================

export function getPendingOutbound(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/finished-goods/pending-outbound', { params })
}

export function shippingOutbound(data: any) {
  return request.post('/finished-goods/outbound', data)
}

// ==================== 库存流水 ====================

export function getTransactionList(params?: { page?: number; limit?: number; search?: string; transaction_type?: string; source_type?: string }) {
  return request.get('/finished-goods/transactions', { params })
}

// ==================== 手动调整 ====================

export function adjustInventory(data: any) {
  return request.post('/finished-goods/adjust', data)
}

// ==================== 仓库选项 ====================

export function getWarehouseOptions() {
  return request.get('/finished-goods/warehouse-options')
}

// ==================== 成品批次库存 ====================

export function getFinishedBatchInventory(params?: { page?: number; limit?: number; search?: string; warehouse_number?: string; status?: string }) {
  return request.get('/finished-goods/batch-inventory', { params })
}

export function getFinishedBatchOptions(params: { item_number: string; warehouse_number?: string }) {
  return request.get('/finished-goods/batch-options', { params })
}

// ==================== 成品安全库存 ====================

export function updateFinishedGoodsSafetyStock(data: { item_number: string; warehouse_number: string; safety_stock_quantity: number }) {
  return request.put('/finished-goods/safety-stock', data)
}

// ==================== 退货入库 ====================

export function getPendingReturnInbound(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/finished-goods/return-inbound/pending', { params })
}

export function getReturnInboundDetail(return_order_number: string) {
  return request.get(`/finished-goods/return-inbound/${return_order_number}`)
}

export function returnInbound(return_order_number: string, data: any) {
  return request.post(`/finished-goods/return-inbound/${return_order_number}`, data)
}

// ==================== 月度出入库报表 ====================

export function getCompletedStockCounts() {
  return request.get('/finished-goods/completed-stock-counts')
}

export function getMonthlyReport(params: { count_number: string }) {
  return request.get('/finished-goods/monthly-report', { params })
}

// ==================== 生产入库单 ====================

export function getInboundOrderList(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/finished-goods/inbound-orders', { params })
}

export function getInboundOrderDetail(inbound_order_number: string) {
  return request.get(`/finished-goods/inbound-orders/${inbound_order_number}`)
}
