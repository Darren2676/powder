import request from '@/utils/request'

export const getStandardCosts = (params?: any) =>
  request.get('/standard-costs', { params })

export const getStandardCostDetail = (id: string) =>
  request.get(`/standard-costs/${encodeURIComponent(id)}`)

export const createStandardCost = (data: any) =>
  request.post('/standard-costs', data)

export const updateStandardCost = (id: string, data: any) =>
  request.put(`/standard-costs/${encodeURIComponent(id)}`, data)

export const deleteStandardCost = (id: string) =>
  request.delete(`/standard-costs/${encodeURIComponent(id)}`)

export const exportStandardCosts = (search?: string, approval_status?: string, cost_list_numbers?: string) =>
  request.get('/standard-costs/export', { params: { search, approval_status, cost_list_numbers }, responseType: 'blob' })

export const importStandardCost = (formData: FormData) =>
  request.post('/standard-costs/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

export const downloadImportTemplate = () =>
  request.get('/standard-costs/import-template', { responseType: 'blob' })