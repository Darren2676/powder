import request from '@/utils/request'

export function getMoulds(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/moulds', { params })
}

export function createMould(data: any) {
  return request.post('/moulds', data)
}

export function updateMould(id: string, data: any) {
  return request.put(`/moulds/${encodeURIComponent(id)}`, data)
}

export function deleteMould(id: string) {
  return request.delete(`/moulds/${encodeURIComponent(id)}`)
}

export function exportMoulds(search?: string) {
  return request.get('/moulds/export', { params: { search }, responseType: 'blob' })
}

export function importMoulds(formData: FormData) {
  return request.post('/moulds/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
