import request from '@/utils/request'

export function getPurchaseReturns(params?: { page?: number; limit?: number; search?: string; approval_status?: string; factory_id?: number }) {
  return request.get('/purchase-returns', { params })
}

export function getPurchaseReturnDetail(id: string) {
  return request.get(`/purchase-returns/${encodeURIComponent(id)}`)
}

export function getPOReceivedItems(poNumber: string) {
  return request.get(`/purchase-returns/po-items/${encodeURIComponent(poNumber)}`)
}

export function createPurchaseReturn(data: any) {
  return request.post('/purchase-returns', data)
}

export function updatePurchaseReturn(id: string, data: any) {
  return request.put(`/purchase-returns/${encodeURIComponent(id)}`, data)
}

export function deletePurchaseReturn(id: string) {
  return request.delete(`/purchase-returns/${encodeURIComponent(id)}`)
}

export function submitPurchaseReturn(id: string) {
  return request.post(`/purchase-returns/${encodeURIComponent(id)}/submit`)
}

export function approvePurchaseReturn(id: string) {
  return request.post(`/purchase-returns/${encodeURIComponent(id)}/approve`)
}

export function rejectPurchaseReturn(id: string) {
  return request.post(`/purchase-returns/${encodeURIComponent(id)}/reject`)
}

export function withdrawPurchaseReturn(id: string) {
  return request.post(`/purchase-returns/${encodeURIComponent(id)}/withdraw`)
}

export function executeReturn(id: string) {
  return request.post(`/purchase-returns/${encodeURIComponent(id)}/execute-return`)
}

export function exchangeStockIn(id: string) {
  return request.post(`/purchase-returns/${encodeURIComponent(id)}/exchange-stock-in`)
}
