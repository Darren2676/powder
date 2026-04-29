import request from '@/utils/request'

export function calculateMPS(params?: { start_date?: string; end_date?: string; customer_number?: string }) {
  return request.get('/mps/calculate', { params })
}

export function importToPlan(data: { items: any[] }) {
  return request.post('/mps/import-to-plan', data)
}

export function getSalesOrdersForMpsImport(params?: { search?: string }) {
  return request.get('/mps/sales-orders-for-import', { params })
}

export function getDemandSources(item_number: string) {
  return request.get('/mps/demand-sources', { params: { item_number } })
}

export function importFromDemandSources(data: { items: any[] }) {
  return request.post('/mps/import-from-demand-sources', data)
}
