import request from '@/utils/request'

/** 查询本地出入库记录（分页搜索） */
export function getInventoryTransactions(params?: {
  page?: number
  limit?: number
  search?: string
  operation_type?: string
  startDate?: string
  endDate?: string
}) {
  return request.get('/xhy-inventory/transactions', { params })
}

/** 获取出入库统计概览 */
export function getInventoryTransactionStats() {
  return request.get('/xhy-inventory/stats')
}
