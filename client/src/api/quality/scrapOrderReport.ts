import request from '@/utils/request'

export function getScrapOrderKPI(params?: { start_date?: string; end_date?: string }) {
  return request.get('/quality/scrap-order-report/kpi', { params })
}

export function getScrapOrderChartData(params?: { start_date?: string; end_date?: string }) {
  return request.get('/quality/scrap-order-report/chart-data', { params })
}

export function getScrapOrderTableData(params?: {
  page?: number; limit?: number; search?: string; start_date?: string; end_date?: string
}) {
  return request.get('/quality/scrap-order-report/table-data', { params })
}
