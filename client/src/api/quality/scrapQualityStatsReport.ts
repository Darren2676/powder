import request from '@/utils/request'

export function getScrapQualityStatsKPI(params?: { start_date?: string; end_date?: string; factory_id?: number }) {
  return request.get('/quality/scrap-quality-stats-report/kpi', { params })
}

export function getScrapQualityStatsChartData(params?: { start_date?: string; end_date?: string; factory_id?: number }) {
  return request.get('/quality/scrap-quality-stats-report/chart-data', { params })
}

export function getScrapQualityStatsTableData(params?: {
  page?: number; limit?: number; search?: string; start_date?: string; end_date?: string; factory_id?: number
}) {
  return request.get('/quality/scrap-quality-stats-report/table-data', { params })
}
