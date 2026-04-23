import request from '@/utils/request'

export function getWorkReports(params?: { page?: number; limit?: number; search?: string; approval_status?: string; process_task_number?: string }) {
  return request.get('/work-reports', { params })
}

export function createWorkReport(data: any) {
  return request.post('/work-reports', data)
}

export function updateWorkReport(wrNumber: string, data: any) {
  return request.put(`/work-reports/${encodeURIComponent(wrNumber)}`, data)
}

export function deleteWorkReport(wrNumber: string) {
  return request.delete(`/work-reports/${encodeURIComponent(wrNumber)}`)
}

export function exportWorkReports(search?: string) {
  return request.get('/work-reports/export', { params: { search }, responseType: 'blob' })
}

export function importWorkReports(formData: FormData) {
  return request.post('/work-reports/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export function getTasksForReport(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/work-reports/tasks-for-report', { params })
}

export function getSchedules() {
  return request.get('/schedules')
}

export function getTeams() {
  return request.get('/teams')
}

export function getEmployees() {
  return request.get('/employees')
}

// 连续报工 - 按生产单获取工序任务及报工统计
export function getTasksByOrder(orderNo: string) {
  return request.get(`/process-tasks/by-order/${encodeURIComponent(orderNo)}`)
}

// 连续报工 - 快速报工
export function quickReport(data: any) {
  return request.post('/work-reports/quick', data)
}

// 连续报工 - 完成生产单（报工最后一道工序 + 确认全部完成）
export function completeOrderReport(data: any) {
  return request.post('/work-reports/complete-order', data)
}

// 连续报工 - 查询某工序任务的历史报工
export function getWorkReportsByTask(processTaskNumber: string) {
  return request.get('/work-reports', { params: { process_task_number: processTaskNumber, limit: 100 } })
}
