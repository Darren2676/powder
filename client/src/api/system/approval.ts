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

// ===== 批量操作 =====
export const batchSubmitForApproval = (module: string, record_ids: string[]) =>
  request.post('/approval/batch-submit', { module, record_ids })

export const batchApproveRecords = (module: string, record_ids: string[]) =>
  request.post('/approval/batch-approve', { module, record_ids })

export const batchWithdrawApproval = (module: string, record_ids: string[]) =>
  request.post('/approval/batch-withdraw', { module, record_ids })

export const batchReverseApproval = (module: string, record_ids: string[]) =>
  request.post('/approval/batch-reverse', { module, record_ids })

export const getPendingApprovals = (params?: { page?: number; limit?: number; status?: string }) =>
  request.get('/approval/pending', { params })
