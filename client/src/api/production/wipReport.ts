import request from '@/utils/request'

// ==================== WIP报告(按生产单) ====================

export function getWipByOrder(params?: { page?: number; limit?: number; search?: string; plan_status?: string }) {
  return request.get('/wip/by-order', { params })
}

export function getWipByOrderDetail(orderNo: string) {
  return request.get(`/wip/by-order/${orderNo}`)
}

export function exportWipByOrderSelected(data: { ids: string[] }) {
  return request.post('/wip/by-order/export-selected', data, { responseType: 'blob' })
}

// ==================== WIP报告(按工作中心) ====================

export function getWipByWorkCenter(params?: { search?: string }) {
  return request.get('/wip/by-work-center', { params })
}

export function getWipByWorkCenterDetail(wcNumber: string) {
  return request.get(`/wip/by-work-center/${wcNumber}`)
}

export function exportWipByWorkCenterSelected(data: { ids: string[] }) {
  return request.post('/wip/by-work-center/export-selected', data, { responseType: 'blob' })
}

// ==================== 线边仓流水 ====================

export function getLinesideTransactions(params?: { page?: number; limit?: number; search?: string; transaction_type?: string; source_type?: string; work_center_number?: string }) {
  return request.get('/wip/lineside-transactions', { params })
}

export function exportLinesideTransactionsSelected(data: { ids: number[] }) {
  return request.post('/wip/lineside-transactions/export-selected', data, { responseType: 'blob' })
}

// ==================== 汇总 ====================

export function getWipSummary() {
  return request.get('/wip/summary')
}
