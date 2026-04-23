import request from '@/utils/request'

// Header CRUD
export const getRoutingHeaders = (params?: any) => request.get('/routing-masters', { params })
export const getRoutingHeaderDetail = (id: string) => request.get(`/routing-masters/${encodeURIComponent(id)}`)
export const createRoutingHeader = (data: any) => request.post('/routing-masters', data)
export const updateRoutingHeader = (id: string, data: any) => request.put(`/routing-masters/${encodeURIComponent(id)}`, data)
export const deleteRoutingHeader = (id: string) => request.delete(`/routing-masters/${encodeURIComponent(id)}`)

// Detail CRUD
export const getRoutingDetails = (headerId: string) => request.get(`/routing-masters/${encodeURIComponent(headerId)}/details`)
export const addRoutingDetail = (headerId: string, data: any) => request.post(`/routing-masters/${encodeURIComponent(headerId)}/details`, data)
export const updateRoutingDetail = (detailId: number, data: any) => request.put(`/routing-masters/details/${detailId}`, data)
export const deleteRoutingDetail = (detailId: number) => request.delete(`/routing-masters/details/${detailId}`)

// Export / Import
export const exportRoutingMasters = (format: string = 'xlsx') => request.get('/routing-masters/export', { params: { format }, responseType: 'blob' })
export const importRoutingMasters = (formData: FormData) => request.post('/routing-masters/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
