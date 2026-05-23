import request from '@/utils/request'

export function getScrapInventoryKPI() {
  return request.get('/quality/scrap-inventory-report/kpi')
}

export function getScrapInventoryChartData() {
  return request.get('/quality/scrap-inventory-report/chart-data')
}

export function getScrapInventoryTableData(params?: {
  page?: number; limit?: number; search?: string
}) {
  return request.get('/quality/scrap-inventory-report/table-data', { params })
}
