import request from '@/utils/request'

// ==================== 退货单管理 ====================

export function getReturnOrders(params?: { page?: number; limit?: number; search?: string; type?: string; status?: string; approval_status?: string }) {
  return request.get('/return-orders', { params })
}

export function getReturnOrderDetailsPage(params?: { page?: number; limit?: number; search?: string; status?: string }) {
  return request.get('/return-orders/details-page', { params })
}

export function exportReturnOrderDetailsSelected(data: { ids: number[] }) {
  return request.post('/return-orders/details-page/export-selected', data, { responseType: 'blob' })
}

export function getReturnOrderDetail(return_order_number: string) {
  return request.get(`/return-orders/${return_order_number}`)
}

export function getShippingOrderForReturn(shipping_order_number: string) {
  return request.get(`/return-orders/shipping-order/${shipping_order_number}`)
}

export function createReturnOrder(data: any) {
  return request.post('/return-orders', data)
}

export function updateReturnOrder(return_order_number: string, data: any) {
  return request.put(`/return-orders/${return_order_number}`, data)
}

export function deleteReturnOrder(return_order_number: string) {
  return request.delete(`/return-orders/${return_order_number}`)
}

export function confirmReturnOrder(return_order_number: string, data?: { confirm_remark?: string }) {
  return request.post(`/return-orders/${return_order_number}/confirm`, data)
}

export function rejectReturnOrder(return_order_number: string, data?: { confirm_remark?: string }) {
  return request.post(`/return-orders/${return_order_number}/reject`, data)
}
