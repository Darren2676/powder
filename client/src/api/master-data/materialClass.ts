import request from '@/utils/request'

export function getMaterialClasses(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/material-classes', { params })
}

export function createMaterialClass(data: any) {
  return request.post('/material-classes', data)
}

export function updateMaterialClass(id: string, data: any) {
  return request.put(`/material-classes/${encodeURIComponent(id)}`, data)
}

export function deleteMaterialClass(id: string) {
  return request.delete(`/material-classes/${encodeURIComponent(id)}`)
}

export function exportMaterialClasses(search?: string) {
  return request.get('/material-classes/export', { params: { search }, responseType: 'blob' })
}

export function importMaterialClasses(formData: FormData) {
  return request.post('/material-classes/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export function approveMaterialClass(id: string) {
  return request.put(`/material-classes/${encodeURIComponent(id)}/approve`)
}

export function withdrawMaterialClass(id: string) {
  return request.put(`/material-classes/${encodeURIComponent(id)}/withdraw`)
}
