import request from '@/utils/request'

// ==================== 采购发票主表 ====================

export function getPurchaseInvoices(params?: {
  page?: number; limit?: number; search?: string;
  approval_status?: string; supplier_number?: string;
  start_date?: string; end_date?: string; factory_id?: number
}) {
  return request.get('/purchase-invoices', { params })
}

export function getPurchaseInvoiceDetail(id: string) {
  return request.get(`/purchase-invoices/${encodeURIComponent(id)}`)
}

export function createPurchaseInvoice(data: any) {
  return request.post('/purchase-invoices', data)
}

export function updatePurchaseInvoice(id: string, data: any) {
  return request.put(`/purchase-invoices/${encodeURIComponent(id)}`, data)
}

export function deletePurchaseInvoice(id: string) {
  return request.delete(`/purchase-invoices/${encodeURIComponent(id)}`)
}

export function approvePurchaseInvoice(id: string) {
  return request.post(`/purchase-invoices/${encodeURIComponent(id)}/approve`)
}

export function withdrawPurchaseInvoice(id: string) {
  return request.post(`/purchase-invoices/${encodeURIComponent(id)}/withdraw`)
}

// ==================== 可开票入库明细行 ====================

export function getAvailableStockInDetails(params: { supplier_number: string; exclude_invoice?: string }) {
  return request.get('/purchase-invoices/available-stock-in-details', { params })
}

// ==================== 双向查询 ====================

export function getInvoicesByStockInDetail(detailId: number) {
  return request.get(`/purchase-invoices/by-stock-in-detail/${detailId}`)
}

export function getInvoicesByPurchaseDetail(detailId: number) {
  return request.get(`/purchase-invoices/by-purchase-detail/${detailId}`)
}
