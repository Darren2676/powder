import request from '@/utils/request'

export function getMaterialPreparations(params?: { page?: number; limit?: number; search?: string; preparation_status?: string; approval_status?: string }) {
  return request.get('/material-preparations', { params })
}

export function createMaterialPreparation(data: any) {
  return request.post('/material-preparations', data)
}

export function updateMaterialPreparation(prepNumber: string, data: any) {
  return request.put(`/material-preparations/${encodeURIComponent(prepNumber)}`, data)
}

export function deleteMaterialPreparation(prepNumber: string) {
  return request.delete(`/material-preparations/${encodeURIComponent(prepNumber)}`)
}

export function exportMaterialPreparations(search?: string) {
  return request.get('/material-preparations/export', { params: { search }, responseType: 'blob' })
}

export function importMaterialPreparations(formData: FormData) {
  return request.post('/material-preparations/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export function generateFromOrder(productionOrderNumbers: string[]) {
  return request.post('/material-preparations/generate-from-order', { production_order_numbers: productionOrderNumbers })
}

export function generateByProcess(productionOrderNumbers: string[]) {
  return request.post('/material-preparations/generate-by-process', { production_order_numbers: productionOrderNumbers })
}

export function getOrdersForGenerate(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/material-preparations/orders-for-generate', { params })
}

export function getPreparationDetails(prepNumber: string) {
  return request.get(`/material-preparations/${encodeURIComponent(prepNumber)}/details`)
}

export function updatePreparationDetails(prepNumber: string, details: any[]) {
  return request.put(`/material-preparations/${encodeURIComponent(prepNumber)}/details`, { details })
}
