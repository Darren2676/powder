import request from '@/utils/request'

export const getInspectionSpecs = (params?: any) =>
  request.get('/quality/inspection-specs', { params })

export const getInspectionSpecDetail = (id: string) =>
  request.get(`/quality/inspection-specs/${encodeURIComponent(id)}`)

export const createInspectionSpec = (data: any) =>
  request.post('/quality/inspection-specs', data)

export const updateInspectionSpec = (id: string, data: any) =>
  request.put(`/quality/inspection-specs/${encodeURIComponent(id)}`, data)

export const deleteInspectionSpec = (id: string) =>
  request.delete(`/quality/inspection-specs/${encodeURIComponent(id)}`)

export const exportInspectionSpecs = () =>
  request.get('/quality/inspection-specs/export', { responseType: 'blob' })

export const getInspectionSpecItems = (headerId: string) =>
  request.get(`/quality/inspection-specs/${encodeURIComponent(headerId)}/items`)

export const addInspectionSpecItem = (headerId: string, data: any) =>
  request.post(`/quality/inspection-specs/${encodeURIComponent(headerId)}/items`, data)

export const updateInspectionSpecItem = (detailId: number, data: any) =>
  request.put(`/quality/inspection-specs/items/${detailId}`, data)

export const deleteInspectionSpecItem = (detailId: number) =>
  request.delete(`/quality/inspection-specs/items/${detailId}`)

export const approveInspectionSpec = (id: string) =>
  request.put(`/quality/inspection-specs/${encodeURIComponent(id)}/approve`)

export const withdrawInspectionSpec = (id: string) =>
  request.put(`/quality/inspection-specs/${encodeURIComponent(id)}/withdraw`)
