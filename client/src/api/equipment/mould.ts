import request from '@/utils/request'

export function getMoulds(params?: { page?: number; limit?: number; search?: string; factory_id?: number }) {
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

export function exportMoulds(search?: string, factory_id?: number) {
  return request.get('/moulds/export', { params: { search, factory_id }, responseType: 'blob' })
}

export function importMoulds(formData: FormData) {
  return request.post('/moulds/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export function approveMould(id: string) {
  return request.put(`/moulds/${encodeURIComponent(id)}/approve`)
}

export function withdrawMould(id: string) {
  return request.put(`/moulds/${encodeURIComponent(id)}/withdraw`)
}

export function updateMouldStrokes(id: string, addStrokes: number) {
  return request.put(`/moulds/${encodeURIComponent(id)}/strokes`, { add_strokes: addStrokes })
}

export function updateMouldLifeSettings(id: string, data: { max_strokes: number; maintenance_cycle_days: number }) {
  return request.put(`/moulds/${encodeURIComponent(id)}/life-settings`, data)
}

export function scrapMould(id: string) {
  return request.put(`/moulds/${encodeURIComponent(id)}/scrap`)
}
