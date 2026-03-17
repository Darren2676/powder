import request from '@/utils/request'

export function getEquipments(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/equipments', { params })
}

export function createEquipment(data: any) {
  return request.post('/equipments', data)
}

export function updateEquipment(id: string, data: any) {
  return request.put(`/equipments/${encodeURIComponent(id)}`, data)
}

export function deleteEquipment(id: string) {
  return request.delete(`/equipments/${encodeURIComponent(id)}`)
}

export function exportEquipments(search?: string) {
  return request.get('/equipments/export', { params: { search }, responseType: 'blob' })
}

export function importEquipments(formData: FormData) {
  return request.post('/equipments/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
