import request from '@/utils/request'

// ==================== Header ====================

export function getSalesOrders(params?: { page?: number; limit?: number; search?: string; approval_status?: string; order_status?: string }) {
  return request.get('/sales-orders', { params })
}

export function getSalesOrderDetail(id: string) {
  return request.get(`/sales-orders/${encodeURIComponent(id)}`)
}

export function createSalesOrder(data: any) {
  return request.post('/sales-orders', data)
}

export function updateSalesOrder(id: string, data: any) {
  return request.put(`/sales-orders/${encodeURIComponent(id)}`, data)
}

export function deleteSalesOrder(id: string) {
  return request.delete(`/sales-orders/${encodeURIComponent(id)}`)
}

export function exportSalesOrders(search?: string) {
  return request.get('/sales-orders/export', { params: { search }, responseType: 'blob' })
}

export function importSalesOrders(formData: FormData) {
  return request.post('/sales-orders/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}

// ==================== Detail ====================

export function getSalesOrderDetailsPage(params?: { page?: number; limit?: number; search?: string; status?: string }) {
  return request.get('/sales-orders/details-page', { params })
}

export function exportSalesOrderDetailsSelected(data: { ids: number[] }) {
  return request.post('/sales-orders/details-page/export-selected', data, { responseType: 'blob' })
}

export function getSalesOrderDetails(headerId: string) {
  return request.get(`/sales-orders/${encodeURIComponent(headerId)}/details`)
}

export function addSalesOrderDetail(headerId: string, data: any) {
  return request.post(`/sales-orders/${encodeURIComponent(headerId)}/details`, data)
}

export function updateSalesOrderDetail(detailId: number, data: any) {
  return request.put(`/sales-orders/details/${detailId}`, data)
}

export function deleteSalesOrderDetail(detailId: number) {
  return request.delete(`/sales-orders/details/${detailId}`)
}
