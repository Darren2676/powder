import request from '@/utils/request'

export function getOutsourcingReceipts(params?: any) {
  return request.get('/outsourcing/receipt', { params })
}

export function getOutsourcingReceiptDetail(id: string) {
  return request.get(`/outsourcing/receipt/${encodeURIComponent(id)}`)
}

export function createOutsourcingReceipt(data: any) {
  return request.post('/outsourcing/receipt', data)
}

export function updateOutsourcingReceipt(id: string, data: any) {
  return request.put(`/outsourcing/receipt/${encodeURIComponent(id)}`, data)
}

export function deleteOutsourcingReceipt(id: string) {
  return request.delete(`/outsourcing/receipt/${encodeURIComponent(id)}`)
}

export function approveReceipt(id: string) {
  return request.post(`/outsourcing/receipt/${encodeURIComponent(id)}/approve`)
}

export function exportOutsourcingReceipts(search?: string) {
  return request.get('/outsourcing/receipt/export', { params: { search }, responseType: 'blob' })
}
