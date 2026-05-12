import request from '@/utils/request'

export function getReceivingNotices(params?: any) {
  return request.get('/receiving-notices', { params })
}

export function getReceivingNoticeDetail(id: string) {
  return request.get(`/receiving-notices/${encodeURIComponent(id)}`)
}

export function createReceivingNotice(data: any) {
  return request.post('/receiving-notices', data)
}

export function deleteReceivingNotice(id: string) {
  return request.delete(`/receiving-notices/${encodeURIComponent(id)}`)
}

export function confirmReceivingNotice(id: string, data?: any) {
  return request.post(`/receiving-notices/${encodeURIComponent(id)}/confirm`, data || {})
}
