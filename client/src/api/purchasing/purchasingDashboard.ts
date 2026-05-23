import request from '@/utils/request'

// ==================== 采购订单仪表板 ====================

export function getPurchaseOrderStats() {
  return request.get('/purchase-orders/stats')
}

export function getPurchaseOrderStatusDistribution() {
  return request.get('/purchase-orders/status-distribution')
}

export function getPurchaseOrderSupplierRanking() {
  return request.get('/purchase-orders/supplier-ranking')
}

export function getPurchaseOrderMonthlyTrend() {
  return request.get('/purchase-orders/monthly-trend')
}

export function getPurchaseOrderRecentList() {
  return request.get('/purchase-orders/recent-list')
}

export function getPurchaseOrderDeliveryTrend() {
  return request.get('/purchase-orders/delivery-trend')
}
