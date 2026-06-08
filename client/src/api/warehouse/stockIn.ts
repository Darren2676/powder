import request from '@/utils/request'

export function getStockIns(params?: { page?: number; limit?: number; search?: string; approval_status?: string; factory_id?: number }) {
  return request.get('/stock-ins', { params })
}

export function getStockInDetail(id: string) {
  return request.get(`/stock-ins/${encodeURIComponent(id)}`)
}

export function createStockIn(data: any) {
  return request.post('/stock-ins', data)
}

export function deleteStockIn(id: string) {
  return request.delete(`/stock-ins/${encodeURIComponent(id)}`)
}

export function confirmStockIn(id: string) {
  return request.post(`/stock-ins/${encodeURIComponent(id)}/confirm`)
}

export function withdrawStockIn(id: string) {
  return request.post(`/stock-ins/${encodeURIComponent(id)}/withdraw`)
}

export function exportStockIns(search?: string) {
  return request.get('/stock-ins/export', { params: { search }, responseType: 'blob' })
}
