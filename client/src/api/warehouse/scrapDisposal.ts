import request from '@/utils/request'

// ==================== 报废仓处置管理 ====================

// 查询报废仓库存（按物料汇总）
export function getScrapInventory(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/scrap-disposal/inventory', { params })
}

// 查询报废仓批次明细
export function getScrapBatchDetail(itemNumber: string) {
  return request.get(`/scrap-disposal/inventory/${itemNumber}/batches`)
}

// 查询处置单列表
export function getScrapDisposalList(params?: { page?: number; limit?: number; search?: string; status?: string }) {
  return request.get('/scrap-disposal/disposals', { params })
}

// 查询处置单详情
export function getScrapDisposalDetail(disposalNumber: string) {
  return request.get(`/scrap-disposal/disposals/${disposalNumber}`)
}

// 创建处置申请
export function createScrapDisposal(data: any) {
  return request.post('/scrap-disposal/disposals', data)
}

// 确认处置（执行出库）
export function confirmScrapDisposal(disposalNumber: string, data?: { confirm_remark?: string }) {
  return request.post(`/scrap-disposal/disposals/${disposalNumber}/confirm`, data)
}

// 驳回处置
export function rejectScrapDisposal(disposalNumber: string, data?: { confirm_remark?: string }) {
  return request.post(`/scrap-disposal/disposals/${disposalNumber}/reject`, data)
}

// 删除处置
export function deleteScrapDisposal(disposalNumber: string) {
  return request.delete(`/scrap-disposal/disposals/${disposalNumber}`)
}

// ==================== 报废仓月度报表 ====================

export function getCompletedScrapStockCounts() {
  return request.get('/scrap-disposal/completed-scrap-stock-counts')
}

export function getScrapMonthlyReport(params: { count_number: string }) {
  return request.get('/scrap-disposal/scrap-monthly-report', { params })
}
