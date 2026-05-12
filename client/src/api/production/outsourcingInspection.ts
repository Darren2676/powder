import request from '@/utils/request'

export function getOutsourcingInspections(params?: any) {
  return request.get('/outsourcing/inspection', { params })
}

export function getOutsourcingInspectionDetail(id: string) {
  return request.get(`/outsourcing/inspection/${encodeURIComponent(id)}`)
}

export function createOutsourcingInspection(data: any) {
  return request.post('/outsourcing/inspection', data)
}

export function updateInspectionResult(id: string, data: any) {
  return request.put(`/outsourcing/inspection/${encodeURIComponent(id)}`, data)
}

export function completeInspection(id: string) {
  return request.post(`/outsourcing/inspection/${encodeURIComponent(id)}/complete`)
}

export function exportOutsourcingInspections(search?: string) {
  return request.get('/outsourcing/inspection/export', { params: { search }, responseType: 'blob' })
}
