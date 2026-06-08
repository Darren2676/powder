import request from '@/utils/request'

// ==================== 生产进度仪表板 ====================

export function getProgressSummary(params?: { dateFrom?: string; dateTo?: string; factory_id?: number }) {
  return request.get('/progress-dashboard/summary', { params })
}

export function getProgressOrders(params?: {
  page?: number
  limit?: number
  search?: string
  plan_status?: string
  inbound_status?: string
  dateFrom?: string
  dateTo?: string
  factory_id?: number
}) {
  return request.get('/progress-dashboard/orders', { params })
}
