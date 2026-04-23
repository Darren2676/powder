import request from '@/utils/request'

// ==================== Header ====================

export function getPurchaseOrders(params?: { page?: number; limit?: number; search?: string; approval_status?: string; order_status?: string }) {
  return request.get('/purchase-orders', { params })
}

export function getPurchaseOrderDetail(id: string) {
  return request.get(`/purchase-orders/${encodeURIComponent(id)}`)
}

export function createPurchaseOrder(data: any) {
  return request.post('/purchase-orders', data)
}

export function updatePurchaseOrder(id: string, data: any) {
  return request.put(`/purchase-orders/${encodeURIComponent(id)}`, data)
}

export function deletePurchaseOrder(id: string) {
  return request.delete(`/purchase-orders/${encodeURIComponent(id)}`)
}

export function exportPurchaseOrders(search?: string) {
  return request.get('/purchase-orders/export', { params: { search }, responseType: 'blob' })
}

// ==================== Detail ====================

export function getPurchaseOrderDetails(headerId: string) {
  return request.get(`/purchase-orders/${encodeURIComponent(headerId)}/details`)
}

export function addPurchaseOrderDetail(headerId: string, data: any) {
  return request.post(`/purchase-orders/${encodeURIComponent(headerId)}/details`, data)
}

export function updatePurchaseOrderDetail(detailId: number, data: any) {
  return request.put(`/purchase-orders/details/${detailId}`, data)
}

export function deletePurchaseOrderDetail(detailId: number) {
  return request.delete(`/purchase-orders/details/${detailId}`)
}

// ==================== 关闭 & 可入库 ====================

export function closePurchaseOrder(id: string) {
  return request.put(`/purchase-orders/${encodeURIComponent(id)}/close`)
}

export function getReceivable(id: string) {
  return request.get(`/purchase-orders/${encodeURIComponent(id)}/receivable`)
}
