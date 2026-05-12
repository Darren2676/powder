import request from '@/utils/request'

export function getSalesPriceLists(params?: { page?: number; limit?: number; search?: string; approval_status?: string }) {
  return request.get('/sales-prices', { params })
}

export function getSalesPriceListDetail(id: string) {
  return request.get(`/sales-prices/${encodeURIComponent(id)}`)
}

export function createSalesPriceList(data: any) {
  return request.post('/sales-prices', data)
}

export function updateSalesPriceList(id: string, data: any) {
  return request.put(`/sales-prices/${encodeURIComponent(id)}`, data)
}

export function deleteSalesPriceList(id: string) {
  return request.delete(`/sales-prices/${encodeURIComponent(id)}`)
}

export function exportSalesPriceLists(search?: string) {
  return request.get('/sales-prices/export', { params: { search }, responseType: 'blob' })
}

export function getSalesPriceForOrder(params: { customer_number: string; item_number: string }) {
  return request.get('/sales-prices/price-for-order', { params })
}

export function importSalesPriceList(formData: FormData) {
  return request.post('/sales-prices/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
