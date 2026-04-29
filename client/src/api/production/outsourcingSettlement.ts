import request from '@/utils/request'

export function getOutsourcingSettlements(params?: any) {
  return request.get('/outsourcing/settlement', { params })
}

export function getOutsourcingSettlementDetail(id: string) {
  return request.get(`/outsourcing/settlement/${encodeURIComponent(id)}`)
}

export function createOutsourcingSettlement(data: any) {
  return request.post('/outsourcing/settlement', data)
}

export function updateOutsourcingSettlement(id: string, data: any) {
  return request.put(`/outsourcing/settlement/${encodeURIComponent(id)}`, data)
}

export function approveSettlement(id: string) {
  return request.post(`/outsourcing/settlement/${encodeURIComponent(id)}/approve`)
}

export function recordPayment(id: string, data: any) {
  return request.post(`/outsourcing/settlement/${encodeURIComponent(id)}/payment`, data)
}

export function exportOutsourcingSettlements(search?: string) {
  return request.get('/outsourcing/settlement/export', { params: { search }, responseType: 'blob' })
}
