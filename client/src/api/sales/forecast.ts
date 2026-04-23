import request from '@/utils/request'

export function getForecasts(params?: { page?: number; limit?: number; search?: string; approval_status?: string; customer_number?: string }) {
  return request.get('/forecasts', { params })
}

export function getForecastDetail(id: string) {
  return request.get(`/forecasts/${encodeURIComponent(id)}`)
}

export function createForecast(data: any) {
  return request.post('/forecasts', data)
}

export function updateForecast(id: string, data: any) {
  return request.put(`/forecasts/${encodeURIComponent(id)}`, data)
}

export function deleteForecast(id: string) {
  return request.delete(`/forecasts/${encodeURIComponent(id)}`)
}

export function getForecastConsumptionLog(id: string) {
  return request.get(`/forecasts/${encodeURIComponent(id)}/consumption`)
}

export function getForecastDetailsPage(params?: { page?: number; limit?: number; search?: string; consumption_status?: string }) {
  return request.get('/forecasts/details-page', { params })
}

export function exportForecastDetailsSelected(data: { ids: number[] }) {
  return request.post('/forecasts/details-page/export-selected', data, { responseType: 'blob' })
}

export function addForecastDetail(forecastNumber: string, data: any) {
  return request.post(`/forecasts/${encodeURIComponent(forecastNumber)}/details`, data)
}

export function updateForecastDetail(detailId: number, data: any) {
  return request.put(`/forecasts/details/${detailId}`, data)
}

export function deleteForecastDetail(detailId: number) {
  return request.delete(`/forecasts/details/${detailId}`)
}
