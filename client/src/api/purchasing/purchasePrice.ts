import request from '@/utils/request'

export function getPurchasePriceLists(params?: { page?: number; limit?: number; search?: string; approval_status?: string }) {
  return request.get('/purchase-prices', { params })
}

export function getPurchasePriceListDetail(id: string) {
  return request.get(`/purchase-prices/${encodeURIComponent(id)}`)
}

export function createPurchasePriceList(data: any) {
  return request.post('/purchase-prices', data)
}

export function updatePurchasePriceList(id: string, data: any) {
  return request.put(`/purchase-prices/${encodeURIComponent(id)}`, data)
}

export function deletePurchasePriceList(id: string) {
  return request.delete(`/purchase-prices/${encodeURIComponent(id)}`)
}

export function exportPurchasePriceLists(search?: string) {
  return request.get('/purchase-prices/export', { params: { search }, responseType: 'blob' })
}

export function importPurchasePriceList(formData: FormData) {
  return request.post('/purchase-prices/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
