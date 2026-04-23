import request from '@/utils/request'

export function getMateriaProperties(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/materia-properties', { params })
}

export function createMateriaProperty(data: any) {
  return request.post('/materia-properties', data)
}

export function updateMateriaProperty(id: string, data: any) {
  return request.put(`/materia-properties/${encodeURIComponent(id)}`, data)
}

export function deleteMateriaProperty(id: string) {
  return request.delete(`/materia-properties/${encodeURIComponent(id)}`)
}

export function exportMateriaProperties(search?: string) {
  return request.get('/materia-properties/export', { params: { search }, responseType: 'blob' })
}

export function importMateriaProperties(formData: FormData) {
  return request.post('/materia-properties/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export function approveMateriaProperty(id: string) {
  return request.put(`/materia-properties/${encodeURIComponent(id)}/approve`)
}

export function withdrawMateriaProperty(id: string) {
  return request.put(`/materia-properties/${encodeURIComponent(id)}/withdraw`)
}
