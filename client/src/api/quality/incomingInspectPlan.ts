import request from '@/utils/request'

export const getIncomingInspectPlans = (params?: any) =>
  request.get('/incoming-inspect-plans', { params })

export const createIncomingInspectPlan = (data: any) =>
  request.post('/incoming-inspect-plans', data)

export const updateIncomingInspectPlan = (id: string, data: any) =>
  request.put(`/incoming-inspect-plans/${encodeURIComponent(id)}`, data)

export const deleteIncomingInspectPlan = (id: string) =>
  request.delete(`/incoming-inspect-plans/${encodeURIComponent(id)}`)

export const exportIncomingInspectPlans = () =>
  request.get('/incoming-inspect-plans/export', { responseType: 'blob' })

export const importIncomingInspectPlans = (formData: FormData) =>
  request.post('/incoming-inspect-plans/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

export const approveIncomingInspectPlan = (id: string) =>
  request.put(`/incoming-inspect-plans/${encodeURIComponent(id)}/approve`)

export const withdrawIncomingInspectPlan = (id: string) =>
  request.put(`/incoming-inspect-plans/${encodeURIComponent(id)}/withdraw`)
