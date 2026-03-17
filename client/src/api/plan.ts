import request from '@/utils/request'

export function getPlans(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/plans', { params })
}

export function createPlan(data: any) {
  return request.post('/plans', data)
}

export function updatePlan(productionNumber: string, data: any) {
  return request.put(`/plans/${encodeURIComponent(productionNumber)}`, data)
}

export function deletePlan(productionNumber: string) {
  return request.delete(`/plans/${encodeURIComponent(productionNumber)}`)
}

export function exportPlans(search?: string) {
  return request.get('/plans/export', { params: { search }, responseType: 'blob' })
}

export function importPlans(formData: FormData) {
  return request.post('/plans/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
