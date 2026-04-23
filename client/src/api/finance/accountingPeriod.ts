import request from '@/utils/request'

// 获取会计期间列表
export function getAccountingPeriods(params?: { fiscal_year?: string; status?: string }) {
  return request.get('/accounting-periods', { params })
}

// 获取可用年度列表
export function getAvailableYears() {
  return request.get('/accounting-periods/years')
}

// 批量生成年度期间
export function generatePeriods(data: { fiscal_year: number; period_type: string }) {
  return request.post('/accounting-periods/generate', data)
}

// 开启期间
export function openPeriod(id: number) {
  return request.put(`/accounting-periods/${id}/open`)
}

// 关闭期间
export function closePeriod(id: number) {
  return request.put(`/accounting-periods/${id}/close`)
}

// 更新期间备注
export function updatePeriod(id: number, data: { remark: string }) {
  return request.put(`/accounting-periods/${id}`, data)
}

// 修改期间日期
export function updatePeriodDates(id: number, data: { start_date: string; end_date: string }) {
  return request.put(`/accounting-periods/${id}/dates`, data)
}

// 删除年度期间
export function deletePeriods(fiscalYear: number) {
  return request.delete(`/accounting-periods/year/${fiscalYear}`)
}
