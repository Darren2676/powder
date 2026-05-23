import request from '@/utils/request'

export const getIncomingInspectSpecs = (params?: any) =>
  request.get('/quality/incoming-inspect-specs', { params })

export const createIncomingInspectSpec = (data: any) =>
  request.post('/quality/incoming-inspect-specs', data)

export const updateIncomingInspectSpec = (id: string, data: any) =>
  request.put(`/quality/incoming-inspect-specs/${encodeURIComponent(id)}`, data)

export const deleteIncomingInspectSpec = (id: string) =>
  request.delete(`/quality/incoming-inspect-specs/${encodeURIComponent(id)}`)

export const exportIncomingInspectSpecs = () =>
  request.get('/quality/incoming-inspect-specs/export', { responseType: 'blob' })

export const getIncomingInspectSpecItems = (headerId: string) =>
  request.get(`/quality/incoming-inspect-specs/${encodeURIComponent(headerId)}/items`)

export const addIncomingInspectSpecItem = (headerId: string, data: any) =>
  request.post(`/quality/incoming-inspect-specs/${encodeURIComponent(headerId)}/items`, data)

export const updateIncomingInspectSpecItem = (detailId: number, data: any) =>
  request.put(`/quality/incoming-inspect-specs/items/${detailId}`, data)

export const deleteIncomingInspectSpecItem = (detailId: number) =>
  request.delete(`/quality/incoming-inspect-specs/items/${detailId}`)

export const approveIncomingInspectSpec = (id: string) =>
  request.put(`/quality/incoming-inspect-specs/${encodeURIComponent(id)}/approve`)

export const withdrawIncomingInspectSpec = (id: string) =>
  request.put(`/quality/incoming-inspect-specs/${encodeURIComponent(id)}/withdraw`)
