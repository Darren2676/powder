import request from '@/utils/request'

export function getOutsourcingOrders(params?: any) {
  return request.get('/outsourcing-orders', { params })
}

export function getOutsourcingOrderDetail(id: string) {
  return request.get(`/outsourcing-orders/${encodeURIComponent(id)}`)
}

export function createOutsourcingOrder(data: any) {
  return request.post('/outsourcing-orders', data)
}

export function updateOutsourcingOrder(id: string, data: any) {
  return request.put(`/outsourcing-orders/${encodeURIComponent(id)}`, data)
}

export function deleteOutsourcingOrder(id: string) {
  return request.delete(`/outsourcing-orders/${encodeURIComponent(id)}`)
}

export function sendOutOrder(id: string) {
  return request.post(`/outsourcing-orders/${encodeURIComponent(id)}/send-out`)
}

export function confirmReceipt(id: string, data: { received_quantity: number }) {
  return request.post(`/outsourcing-orders/${encodeURIComponent(id)}/confirm-receipt`, data)
}

export function closeOutsourcingOrder(id: string) {
  return request.post(`/outsourcing-orders/${encodeURIComponent(id)}/close`)
}

export function exportOutsourcingOrders(search?: string) {
  return request.get('/outsourcing-orders/export', { params: { search }, responseType: 'blob' })
}
