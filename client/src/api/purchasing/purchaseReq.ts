import request from '@/utils/request'

// ==================== Header ====================

export function getPurchaseReqs(params?: { page?: number; limit?: number; search?: string; approval_status?: string; order_status?: string; factory_id?: number }) {
  return request.get('/purchase-reqs', { params })
}

export function getPurchaseReqDetail(id: string) {
  return request.get(`/purchase-reqs/${encodeURIComponent(id)}`)
}

export function createPurchaseReq(data: any) {
  return request.post('/purchase-reqs', data)
}

export function updatePurchaseReq(id: string, data: any) {
  return request.put(`/purchase-reqs/${encodeURIComponent(id)}`, data)
}

export function deletePurchaseReq(id: string) {
  return request.delete(`/purchase-reqs/${encodeURIComponent(id)}`)
}

export function exportPurchaseReqs(search?: string, factory_id?: number) {
  return request.get('/purchase-reqs/export', { params: { search, factory_id }, responseType: 'blob' })
}

export function getPurchaseReqDetailsPage(params?: { page?: number; limit?: number; search?: string; status?: string; factory_id?: number }) {
  return request.get('/purchase-reqs/details-page', { params })
}

export function exportPurchaseReqDetailsSelected(data: { ids: number[] }) {
  return request.post('/purchase-reqs/details-page/export-selected', data, { responseType: 'blob' })
}

// ==================== Detail ====================

export function getPurchaseReqDetails(headerId: string) {
  return request.get(`/purchase-reqs/${encodeURIComponent(headerId)}/details`)
}

export function addPurchaseReqDetail(headerId: string, data: any) {
  return request.post(`/purchase-reqs/${encodeURIComponent(headerId)}/details`, data)
}

export function updatePurchaseReqDetail(detailId: number, data: any) {
  return request.put(`/purchase-reqs/details/${detailId}`, data)
}

export function deletePurchaseReqDetail(detailId: number) {
  return request.delete(`/purchase-reqs/details/${detailId}`)
}

// ==================== 转采购订单 ====================

export function toOrder(id: string, data: any) {
  return request.post(`/purchase-reqs/${encodeURIComponent(id)}/to-order`, data)
}
