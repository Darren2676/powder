import request from '@/utils/request'

export function getMaterials(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/materials', { params })
}

export function createMaterial(data: any) {
  return request.post('/materials', data)
}

export function updateMaterial(itemNumber: string, data: any) {
  return request.put(`/materials/${itemNumber}`, data)
}

export function deleteMaterial(itemNumber: string) {
  return request.delete(`/materials/${itemNumber}`)
}

export function exportMaterials(search?: string) {
  return request.get('/materials/export', {
    params: { search },
    responseType: 'blob'
  })
}

export function importMaterials(formData: FormData) {
  return request.post('/materials/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
