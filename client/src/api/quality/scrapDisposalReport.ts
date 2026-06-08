import request from '@/utils/request'

export function getScrapDisposalKPI(params?: { start_date?: string; end_date?: string; factory_id?: number }) {
  return request.get('/quality/scrap-disposal-report/kpi', { params })
}

export function getScrapDisposalChartData(params?: { start_date?: string; end_date?: string; factory_id?: number }) {
  return request.get('/quality/scrap-disposal-report/chart-data', { params })
}

export function getScrapDisposalTableData(params?: {
  page?: number; limit?: number; search?: string; start_date?: string; end_date?: string; factory_id?: number
}) {
  return request.get('/quality/scrap-disposal-report/table-data', { params })
}
