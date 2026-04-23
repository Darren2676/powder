import request from '@/utils/request'

export const getInspectionSpecs = (params?: any) =>
  request.get('/inspection-specs', { params })

export const getInspectionSpecDetail = (id: string) =>
  request.get(`/inspection-specs/${encodeURIComponent(id)}`)

export const createInspectionSpec = (data: any) =>
  request.post('/inspection-specs', data)

export const updateInspectionSpec = (id: string, data: any) =>
  request.put(`/inspection-specs/${encodeURIComponent(id)}`, data)

export const deleteInspectionSpec = (id: string) =>
  request.delete(`/inspection-specs/${encodeURIComponent(id)}`)

export const exportInspectionSpecs = () =>
  request.get('/inspection-specs/export', { responseType: 'blob' })

export const getInspectionSpecItems = (headerId: string) =>
  request.get(`/inspection-specs/${encodeURIComponent(headerId)}/items`)

export const addInspectionSpecItem = (headerId: string, data: any) =>
  request.post(`/inspection-specs/${encodeURIComponent(headerId)}/items`, data)

export const updateInspectionSpecItem = (detailId: number, data: any) =>
  request.put(`/inspection-specs/items/${detailId}`, data)

export const deleteInspectionSpecItem = (detailId: number) =>
  request.delete(`/inspection-specs/items/${detailId}`)

export const approveInspectionSpec = (id: string) =>
  request.put(`/inspection-specs/${encodeURIComponent(id)}/approve`)

export const withdrawInspectionSpec = (id: string) =>
  request.put(`/inspection-specs/${encodeURIComponent(id)}/withdraw`)
