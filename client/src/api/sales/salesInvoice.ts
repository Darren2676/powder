import request from '@/utils/request'

// ==================== 发票主表 ====================

export function getSalesInvoices(params?: {
  page?: number; limit?: number; search?: string;
  approval_status?: string; customer_number?: string;
  start_date?: string; end_date?: string
}) {
  return request.get('/sales-invoices', { params })
}

export function getSalesInvoiceDetail(id: string) {
  return request.get(`/sales-invoices/${encodeURIComponent(id)}`)
}

export function createSalesInvoice(data: any) {
  return request.post('/sales-invoices', data)
}

export function updateSalesInvoice(id: string, data: any) {
  return request.put(`/sales-invoices/${encodeURIComponent(id)}`, data)
}

export function deleteSalesInvoice(id: string) {
  return request.delete(`/sales-invoices/${encodeURIComponent(id)}`)
}

export function approveSalesInvoice(id: string) {
  return request.post(`/sales-invoices/${encodeURIComponent(id)}/approve`)
}

export function withdrawSalesInvoice(id: string) {
  return request.post(`/sales-invoices/${encodeURIComponent(id)}/withdraw`)
}

// ==================== 可开票发货明细行 ====================

export function getAvailableShippingDetails(params: { customer_number: string; exclude_invoice?: string }) {
  return request.get('/sales-invoices/available-shipping-details', { params })
}

// ==================== 双向查询 ====================

export function getInvoicesByShippingDetail(detailId: number) {
  return request.get(`/sales-invoices/by-shipping-detail/${detailId}`)
}

export function getInvoicesBySalesDetail(detailId: number) {
  return request.get(`/sales-invoices/by-sales-detail/${detailId}`)
}

// ==================== 导出导入 ====================

export function exportSalesInvoices(search?: string) {
  return request.get('/sales-invoices/export', { params: { search }, responseType: 'blob' })
}

export function importSalesInvoices(formData: FormData) {
  return request.post('/sales-invoices/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
