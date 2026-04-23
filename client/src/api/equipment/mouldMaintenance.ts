import request from '@/utils/request'

export function getMouldMaintenances(params?: any) {
  return request.get('/mould-maintenance', { params })
}

export function createMouldMaintenance(data: any) {
  return request.post('/mould-maintenance', data)
}

export function updateMouldMaintenance(id: number, data: any) {
  return request.put(`/mould-maintenance/${id}`, data)
}

export function deleteMouldMaintenance(id: number) {
  return request.delete(`/mould-maintenance/${id}`)
}

export function exportMouldMaintenances(params?: any) {
  return request.get('/mould-maintenance/export', { params, responseType: 'blob' })
}

export function importMouldMaintenances(formData: FormData) {
  return request.post('/mould-maintenance/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
