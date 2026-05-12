import request from '@/utils/request'

export const getPieceRatePrices = (params?: any) =>
  request.get('/piece-rate-prices', { params })

export const getPieceRatePriceDetail = (id: string) =>
  request.get(`/piece-rate-prices/${encodeURIComponent(id)}`)

export const createPieceRatePrice = (data: any) =>
  request.post('/piece-rate-prices', data)

export const updatePieceRatePrice = (id: string, data: any) =>
  request.put(`/piece-rate-prices/${encodeURIComponent(id)}`, data)

export const deletePieceRatePrice = (id: string) =>
  request.delete(`/piece-rate-prices/${encodeURIComponent(id)}`)

export const exportPieceRatePrices = (search?: string, approval_status?: string) =>
  request.get('/piece-rate-prices/export', { params: { search, approval_status }, responseType: 'blob' })

export const importPieceRatePrice = (formData: FormData) =>
  request.post('/piece-rate-prices/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
