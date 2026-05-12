import request from '@/utils/request'

// ==================== 待发货列表 ====================

export function getPendingShipments(params?: { page?: number; limit?: number; search?: string; approval_status?: string }) {
  return request.get('/shipping-requests/pending', { params })
}

// ==================== 待发货申请明细 ====================

export function getPendingRequestDetails(params?: { page?: number; limit?: number; search?: string; status?: string }) {
  return request.get('/shipping-requests/pending-details', { params })
}

export function exportPendingRequestDetailsSelected(data: { ids: number[] }) {
  return request.post('/shipping-requests/pending-details/export-selected', data, { responseType: 'blob' })
}

// ==================== 发货申请 ====================

export function getShippingRequests(params?: { page?: number; limit?: number; search?: string; status?: string }) {
  return request.get('/shipping-requests', { params })
}

export function getShippingRequestDetail(id: string) {
  return request.get(`/shipping-requests/${encodeURIComponent(id)}`)
}

export function createShippingRequest(data: any) {
  return request.post('/shipping-requests', data)
}

export function updateShippingRequest(id: string, data: any) {
  return request.put(`/shipping-requests/${encodeURIComponent(id)}`, data)
}

export function updateShippingRequestStatus(id: string, status: string) {
  return request.put(`/shipping-requests/${encodeURIComponent(id)}/status`, { status })
}

export function deleteShippingRequest(id: string) {
  return request.delete(`/shipping-requests/${encodeURIComponent(id)}`)
}

// ==================== 出库撤回 ====================

export function rollbackShippingOutbound(request_number: string) {
  return request.post('/finished-goods/outbound/rollback', { request_number })
}
