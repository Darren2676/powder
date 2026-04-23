import request from '@/utils/request'

export function getPlans(params?: { page?: number; limit?: number; search?: string; approval_status?: string; mrp_status?: string; plan_status?: string }) {
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

export function getSalesOrdersForImport(params?: { search?: string }) {
  return request.get('/plans/sales-orders-for-import', { params })
}

export function importFromSalesOrder(data: { items: any[] }) {
  return request.post('/plans/import-from-sales-order', data)
}

export function getForecastsForImport(params?: { search?: string }) {
  return request.get('/plans/forecasts-for-import', { params })
}

export function importFromForecast(data: { items: any[] }) {
  return request.post('/plans/import-from-forecast', data)
}
