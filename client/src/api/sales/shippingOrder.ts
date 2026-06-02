import request from '@/utils/request'

// ==================== 发货单管理 ====================

export function getShippingOrderDetailsPage(params?: { page?: number; limit?: number; search?: string; status?: string }) {
  return request.get('/shipping-orders/details-page', { params })
}

export function exportShippingOrderDetailsSelected(data: { ids: number[] }) {
  return request.post('/shipping-orders/details-page/export-selected', data, { responseType: 'blob' })
}

export function getShippingOrders(params?: { page?: number; limit?: number; search?: string; status?: string }) {
  return request.get('/shipping-orders', { params })
}

export function getShippingOrderDetail(shipping_order_number: string) {
  return request.get(`/shipping-orders/${shipping_order_number}`)
}

export function updateShippingOrderLogistics(shipping_order_number: string, data: {
  carrier?: string; tracking_number?: string; freight?: number;
  shipping_address?: string; contact_person?: string; contact_phone?: string
}) {
  return request.put(`/shipping-orders/${shipping_order_number}/logistics`, data)
}

export function updateShippingOrderStatus(shipping_order_number: string, data: { status: string }) {
  return request.put(`/shipping-orders/${shipping_order_number}/status`, data)
}

export function getShippingOrderPrintData(shipping_order_number: string) {
  return request.get(`/shipping-orders/${shipping_order_number}/print`)
}

export function cancelShippingOrder(shipping_order_number: string) {
  return request.post(`/shipping-orders/${shipping_order_number}/cancel`)
}

// ==================== 销售对账 ====================

export function getReconciliationPage(params?: { page?: number; limit?: number; search?: string; reconciliationStatus?: string }) {
  return request.get('/shipping-orders/reconciliation/page', { params })
}

export function updateReconciliationStatus(data: { detailIds: number[]; reconciliationStatus: string }) {
  return request.put('/shipping-orders/reconciliation/status', data)
}

export function getReconciliationPrintData(detailIds: number[]) {
  return request.post('/shipping-orders/reconciliation/print', { detailIds })
}
