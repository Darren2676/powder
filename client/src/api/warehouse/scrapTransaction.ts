import request from '@/utils/request'

// 查询报废仓库存流水记录
export function getScrapTransactionList(params?: { page?: number; limit?: number; search?: string; transaction_type?: string; source_type?: string; status?: string }) {
  return request.get('/scrap-transactions', { params })
}
