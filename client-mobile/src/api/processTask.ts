import request from './request'

/** 获取工序任务列表 */
export function getProcessTasks(params?: {
  page?: number
  limit?: number
  search?: string
  task_status?: string
  approval_status?: string
  production_order_number?: string
  work_center_number?: string
}) {
  return request.get('/process-tasks', { params })
}

/** 获取可报工的生产单列表（按生产日期倒序） */
export function getOrdersForReport(params?: {
  page?: number
  limit?: number
  search?: string
}) {
  return request.get('/process-tasks/orders-for-report', { params })
}

/** 获取生产单的工序任务详情（含报工状态和物料门控） */
export function getTasksByOrder(orderNo: string) {
  return request.get(`/process-tasks/by-order/${encodeURIComponent(orderNo)}`)
}
