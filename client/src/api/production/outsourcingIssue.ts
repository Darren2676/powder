import request from '@/utils/request'

// 获取委外发料单列表
export function getOutsourcingIssues(params?: any) {
  return request.get('/outsourcing/issue', { params })
}

// 获取委外发料单详情
export function getOutsourcingIssueDetail(id: string) {
  return request.get(`/outsourcing/issue/${encodeURIComponent(id)}`)
}

// 创建委外发料单
export function createOutsourcingIssue(data: any) {
  return request.post('/outsourcing/issue', data)
}

// 更新委外发料单
export function updateOutsourcingIssue(id: string, data: any) {
  return request.put(`/outsourcing/issue/${encodeURIComponent(id)}`, data)
}

// 删除委外发料单
export function deleteOutsourcingIssue(id: string) {
  return request.delete(`/outsourcing/issue/${encodeURIComponent(id)}`)
}

// 审核委外发料单
export function approveIssue(id: string) {
  return request.post(`/outsourcing/issue/${encodeURIComponent(id)}/approve`)
}

// 确认发料
export function confirmIssue(id: string) {
  return request.post(`/outsourcing/issue/${encodeURIComponent(id)}/confirm`)
}

// 导出委外发料单
export function exportOutsourcingIssues(search?: string) {
  return request.get('/outsourcing/issue/export', { params: { search }, responseType: 'blob' })
}
