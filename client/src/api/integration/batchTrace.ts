import request from '@/utils/request'

// 正向追溯：成品批次 → 原材料
export function forwardTrace(params: { batch_number: string }) {
  return request.get('/batch-trace/forward', { params })
}

// 反向追溯：原材料批次 → 成品
export function reverseTrace(params: { batch_number: string }) {
  return request.get('/batch-trace/reverse', { params })
}

// 批次搜索
export function searchBatch(params: { keyword: string; type?: string }) {
  return request.get('/batch-trace/search', { params })
}

// 批次详情
export function getBatchDetail(params: { batch_number: string; type?: string }) {
  return request.get('/batch-trace/detail', { params })
}

// 按生产单追溯
export function traceByProductionOrder(params: { production_order_number: string }) {
  return request.get('/batch-trace/production-order', { params })
}
