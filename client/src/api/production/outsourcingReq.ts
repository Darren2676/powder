import request from '@/utils/request'

export function getOutsourcingReqs(params?: any) {
  return request.get('/outsourcing-reqs', { params })
}

export function getOutsourcingReqDetail(id: string) {
  return request.get(`/outsourcing-reqs/${encodeURIComponent(id)}`)
}

export function createOutsourcingReq(data: any) {
  return request.post('/outsourcing-reqs', data)
}

export function updateOutsourcingReq(id: string, data: any) {
  return request.put(`/outsourcing-reqs/${encodeURIComponent(id)}`, data)
}

export function deleteOutsourcingReq(id: string) {
  return request.delete(`/outsourcing-reqs/${encodeURIComponent(id)}`)
}

export function outsourcingReqToOrder(id: string, data: any) {
  return request.post(`/outsourcing-reqs/${encodeURIComponent(id)}/to-order`, data)
}

export function exportOutsourcingReqs(search?: string) {
  return request.get('/outsourcing-reqs/export', { params: { search }, responseType: 'blob' })
}
