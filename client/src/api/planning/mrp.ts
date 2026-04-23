import request from '@/utils/request'

export function getPlansForMrp(params?: { search?: string; start_date?: string; end_date?: string }) {
  return request.get('/mrp/plans-for-mrp', { params })
}

export function runMRP(data: { production_numbers: string[] }) {
  return request.post('/mrp/run', data)
}

export function getMRPRuns(params?: { page?: number; limit?: number; search?: string; run_status?: string }) {
  return request.get('/mrp', { params })
}

export function getMRPRunDetail(mrp_run_number: string) {
  return request.get(`/mrp/${mrp_run_number}`)
}

export function executeMRP(data: { mrp_run_number: string; items: Array<{ id: number; produce_quantity?: number; purchase_quantity?: number }> }) {
  return request.post('/mrp/execute', data)
}

export function cancelMRPRun(mrp_run_number: string) {
  return request.post(`/mrp/${mrp_run_number}/cancel`)
}

export function deleteMRPRun(mrp_run_number: string) {
  return request.delete(`/mrp/${mrp_run_number}`)
}
