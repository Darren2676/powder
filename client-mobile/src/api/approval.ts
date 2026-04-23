import request from './request'

/** 提交审批 */
export function submitForApproval(module: string, recordId: string) {
  return request.post('/approval/submit', { module, record_id: recordId })
}

/** 审批通过 */
export function approveRecord(module: string, recordId: string) {
  return request.post('/approval/approve', { module, record_id: recordId })
}
