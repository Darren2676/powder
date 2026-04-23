import request from './request'

/** 获取报工单列表 */
export function getWorkReports(params?: {
  page?: number
  limit?: number
  search?: string
  approval_status?: string
  process_task_number?: string
}) {
  return request.get('/work-reports', { params })
}

/** 创建报工单（标准方式） */
export function createWorkReport(data: any) {
  return request.post('/work-reports', data)
}

/** 快速报工（移动端简化接口） */
export function quickReport(data: {
  process_task_number: string
  qualified_quantity: number
  unqualified_quantity: number
  report_date: string
  schedules_id?: string
  schedules_name?: string
  team_number?: string
  team_name?: string
  operator_number?: string
  operator_name?: string
  actual_start_time?: string
  actual_end_time?: string
  unqualified_reason?: string
  remark?: string
}) {
  return request.post('/work-reports/quick', data)
}

/** 获取班次列表 */
export function getSchedules() {
  return request.get('/schedules')
}

/** 获取班组列表 */
export function getTeams() {
  return request.get('/teams')
}

/** 获取员工列表 */
export function getEmployees() {
  return request.get('/employees')
}

/** 获取缺陷分类列表 */
export function getDefectClasses(params?: { search?: string; limit?: number }) {
  return request.get('/defect-classes', { params: { limit: 999, ...params } })
}

/** 获取缺陷列表 */
export function getDefects(params?: { search?: string; limit?: number }) {
  return request.get('/defects', { params: { limit: 999, ...params } })
}
