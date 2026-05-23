import request from '@/utils/request'

export const getPieceRateWages = (params?: any) =>
  request.get('/piece-rate-wages', { params })

export const getPieceRateWageDetail = (id: string) =>
  request.get(`/piece-rate-wages/${encodeURIComponent(id)}`)

export const getPieceRateWageSummary = (id: string) =>
  request.get(`/piece-rate-wages/${encodeURIComponent(id)}/summary`)

export const createPieceRateWage = (data: any) =>
  request.post('/piece-rate-wages', data)

export const updatePieceRateWage = (id: string, data: any) =>
  request.put(`/piece-rate-wages/${encodeURIComponent(id)}`, data)

export const deletePieceRateWage = (id: string) =>
  request.delete(`/piece-rate-wages/${encodeURIComponent(id)}`)

export const calculatePieceRateWage = (id: string) =>
  request.post(`/piece-rate-wages/${encodeURIComponent(id)}/calculate`)

export const exportPieceRateWages = (search?: string, approval_status?: string) =>
  request.get('/piece-rate-wages/export', { params: { search, approval_status }, responseType: 'blob' })

export const exportPieceRateWagesSelected = (data: { ids: string[] }) =>
  request.post('/piece-rate-wages/export-selected', data, { responseType: 'blob' })
