import request from '@/utils/request'

// ==================== 采购订单仪表板 ====================

export function getPurchaseOrderStats(params?: { factory_id?: number }) {
  return request.get('/purchase-orders/stats', { params })
}

export function getPurchaseOrderStatusDistribution(params?: { factory_id?: number }) {
  return request.get('/purchase-orders/status-distribution', { params })
}

export function getPurchaseOrderSupplierRanking(params?: { factory_id?: number }) {
  return request.get('/purchase-orders/supplier-ranking', { params })
}

export function getPurchaseOrderMonthlyTrend(params?: { factory_id?: number }) {
  return request.get('/purchase-orders/monthly-trend', { params })
}

export function getPurchaseOrderRecentList(params?: { factory_id?: number }) {
  return request.get('/purchase-orders/recent-list', { params })
}

export function getPurchaseOrderDeliveryTrend(params?: { factory_id?: number }) {
  return request.get('/purchase-orders/delivery-trend', { params })
}
