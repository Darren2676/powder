import request from '@/utils/request'

export const submitForApproval = (module: string, record_id: string, remark?: string) =>
  request.post('/approval/submit', { module, record_id, remark })

export const approveRecord = (module: string, record_id: string, remark?: string) =>
  request.post('/approval/approve', { module, record_id, remark })

export const reverseApproval = (module: string, record_id: string, remark?: string) =>
  request.post('/approval/reverse', { module, record_id, remark })

export const withdrawApproval = (module: string, record_id: string) =>
  request.post('/approval/withdraw', { module, record_id })

export const getApprovalLog = (module: string, record_id: string) =>
  request.get('/approval/log', { params: { module, record_id } })
