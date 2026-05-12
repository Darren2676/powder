import request from '@/utils/request'

// ==================== 其他出入库管理 ====================

export function getAbnormalIOList(params?: { page?: number; limit?: number; search?: string; type?: string; status?: string }) {
  return request.get('/abnormal-io', { params })
}

export function getAbnormalIODetail(request_number: string) {
  return request.get(`/abnormal-io/${request_number}`)
}

export function createAbnormalIO(data: any) {
  return request.post('/abnormal-io', data)
}

export function updateAbnormalIO(request_number: string, data: any) {
  return request.put(`/abnormal-io/${request_number}`, data)
}

export function deleteAbnormalIO(request_number: string) {
  return request.delete(`/abnormal-io/${request_number}`)
}

export function confirmAbnormalIO(request_number: string, data?: { confirm_remark?: string }) {
  return request.post(`/abnormal-io/${request_number}/confirm`, data)
}

export function rejectAbnormalIO(request_number: string, data?: { confirm_remark?: string }) {
  return request.post(`/abnormal-io/${request_number}/reject`, data)
}

export function withdrawAbnormalIO(request_number: string, data?: { remark?: string }) {
  return request.post(`/abnormal-io/${request_number}/withdraw`, data)
}
