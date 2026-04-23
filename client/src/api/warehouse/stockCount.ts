import request from '@/utils/request'

// 盘点单列表
export function getStockCountList(params: any) {
  return request.get('/stock-counts', { params })
}

// 盘点单详情
export function getStockCountDetail(count_number: string) {
  return request.get(`/stock-counts/${count_number}`)
}

// 快照预览
export function getSnapshotPreview(params: any) {
  return request.get('/stock-counts/snapshot-preview', { params })
}

// 创建盘点单
export function createStockCount(data: any) {
  return request.post('/stock-counts', data)
}

// 更新盘点明细
export function updateStockCount(count_number: string, data: any) {
  return request.put(`/stock-counts/${count_number}`, data)
}

// 删除盘点单
export function deleteStockCount(count_number: string) {
  return request.delete(`/stock-counts/${count_number}`)
}

// 提交复核
export function submitReview(count_number: string) {
  return request.post(`/stock-counts/${count_number}/submit-review`)
}

// 复核
export function reviewStockCount(count_number: string, data: any) {
  return request.post(`/stock-counts/${count_number}/review`, data)
}

// 确认执行
export function confirmStockCount(count_number: string, data: any) {
  return request.post(`/stock-counts/${count_number}/confirm`, data)
}

// 作废
export function cancelStockCount(count_number: string, data: any) {
  return request.post(`/stock-counts/${count_number}/cancel`, data)
}

// 报表：盘点汇总
export function getReportSummary(params: any) {
  return request.get('/stock-counts/report/summary', { params })
}

// 报表：差异明细
export function getReportDiffDetail(params: any) {
  return request.get('/stock-counts/report/diff-detail', { params })
}

// 报表：盘点趋势
export function getReportTrend(params: any) {
  return request.get('/stock-counts/report/trend', { params })
}
