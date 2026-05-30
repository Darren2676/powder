import request from '@/utils/request'

const BASE = '/expense-claims'

// ==================== 主表 CRUD ====================
export function getExpenseClaims(params?: any) {
  return request.get(BASE, { params })
}

export function getClaimTypes() {
  return request.get(`${BASE}/claim-types`)
}

export function getExpenseClaimDetail(id: number | string) {
  return request.get(`${BASE}/${id}`)
}

export function createExpenseClaim(data: any) {
  return request.post(BASE, data)
}

export function updateExpenseClaim(id: number | string, data: any) {
  return request.put(`${BASE}/${id}`, data)
}

export function deleteExpenseClaim(id: number | string) {
  return request.delete(`${BASE}/${id}`)
}

// ==================== 审批流 ====================
export function submitExpenseClaim(id: number | string, data?: any) {
  return request.post(`${BASE}/${id}/submit`, data)
}

export function approveExpenseClaim(id: number | string, data?: any) {
  return request.post(`${BASE}/${id}/approve`, data)
}

export function rejectExpenseClaim(id: number | string, data?: any) {
  return request.post(`${BASE}/${id}/reject`, data)
}

export function withdrawExpenseClaim(id: number | string) {
  return request.post(`${BASE}/${id}/withdraw`)
}

export function reverseExpenseClaim(id: number | string, data?: any) {
  return request.post(`${BASE}/${id}/reverse`, data)
}

// ==================== 附件 ====================
export function uploadAttachment(id: number | string, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post(`${BASE}/${id}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function deleteAttachment(id: number | string, attachId: number | string) {
  return request.delete(`${BASE}/${id}/attachments/${attachId}`)
}

// ==================== 工作流状态查询 ====================
/** 检查报销单模块是否有已发布的流程定义 */
export function checkWorkflowActive() {
  return request.get('/workflow-runtime/check/expense_claim')
}

/** 获取报销单对应的工作流实例 */
export function getWorkflowInstance(claimNumber: string) {
  return request.get(`/workflow-runtime/instances/expense_claim/${claimNumber}`)
}
