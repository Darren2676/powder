import request from '@/utils/request'

export function searchOrders(keyword: string) {
  return request.get('/material-issues/search-orders', { params: { keyword } })
}

export function queryByOrder(orderNo: string) {
  return request.get(`/material-issues/query-by-order/${encodeURIComponent(orderNo)}`)
}

export function createMaterialIssue(data: { preparation_number: string; production_order_number: string; remark?: string; items: any[] }) {
  return request.post('/material-issues', data)
}

export function getMaterialIssues(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/material-issues', { params })
}

export function getMaterialIssueDetail(issueNumber: string) {
  return request.get(`/material-issues/${encodeURIComponent(issueNumber)}`)
}

export function deleteMaterialIssue(issueNumber: string) {
  return request.delete(`/material-issues/${encodeURIComponent(issueNumber)}`)
}
