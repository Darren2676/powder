import request from '@/utils/request'

export const getIncomingInspectSpecs = (params?: any) =>
  request.get('/incoming-inspect-specs', { params })

export const createIncomingInspectSpec = (data: any) =>
  request.post('/incoming-inspect-specs', data)

export const updateIncomingInspectSpec = (id: string, data: any) =>
  request.put(`/incoming-inspect-specs/${encodeURIComponent(id)}`, data)

export const deleteIncomingInspectSpec = (id: string) =>
  request.delete(`/incoming-inspect-specs/${encodeURIComponent(id)}`)

export const exportIncomingInspectSpecs = () =>
  request.get('/incoming-inspect-specs/export', { responseType: 'blob' })

export const getIncomingInspectSpecItems = (headerId: string) =>
  request.get(`/incoming-inspect-specs/${encodeURIComponent(headerId)}/items`)

export const addIncomingInspectSpecItem = (headerId: string, data: any) =>
  request.post(`/incoming-inspect-specs/${encodeURIComponent(headerId)}/items`, data)

export const updateIncomingInspectSpecItem = (detailId: number, data: any) =>
  request.put(`/incoming-inspect-specs/items/${detailId}`, data)

export const deleteIncomingInspectSpecItem = (detailId: number) =>
  request.delete(`/incoming-inspect-specs/items/${detailId}`)

export const approveIncomingInspectSpec = (id: string) =>
  request.put(`/incoming-inspect-specs/${encodeURIComponent(id)}/approve`)

export const withdrawIncomingInspectSpec = (id: string) =>
  request.put(`/incoming-inspect-specs/${encodeURIComponent(id)}/withdraw`)
