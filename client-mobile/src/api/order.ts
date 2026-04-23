import request from './request'

/** 获取生产单列表（分页+搜索） */
export function getOrders(params?: {
  page?: number
  limit?: number
  search?: string
  status?: string
  approval_status?: string
}) {
  return request.get('/orders', { params })
}

/** 获取生产单详情概览（聚合接口） */
export function getOrderOverview(orderNumber: string) {
  return request.get(`/orders/${encodeURIComponent(orderNumber)}/overview`)
}
