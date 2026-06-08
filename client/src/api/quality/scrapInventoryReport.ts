import request from '@/utils/request'

export function getScrapInventoryKPI(params?: { factory_id?: number }) {
  return request.get('/quality/scrap-inventory-report/kpi', { params })
}

export function getScrapInventoryChartData(params?: { factory_id?: number }) {
  return request.get('/quality/scrap-inventory-report/chart-data', { params })
}

export function getScrapInventoryTableData(params?: {
  page?: number; limit?: number; search?: string; factory_id?: number
}) {
  return request.get('/quality/scrap-inventory-report/table-data', { params })
}
