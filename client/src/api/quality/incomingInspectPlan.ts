import request from '@/utils/request'

export const getIncomingInspectPlans = (params?: any) =>
  request.get('/quality/incoming-inspect-plans', { params })

export const createIncomingInspectPlan = (data: any) =>
  request.post('/quality/incoming-inspect-plans', data)

export const updateIncomingInspectPlan = (id: string, data: any) =>
  request.put(`/quality/incoming-inspect-plans/${encodeURIComponent(id)}`, data)

export const deleteIncomingInspectPlan = (id: string) =>
  request.delete(`/quality/incoming-inspect-plans/${encodeURIComponent(id)}`)

export const exportIncomingInspectPlans = () =>
  request.get('/quality/incoming-inspect-plans/export', { responseType: 'blob' })

export const importIncomingInspectPlans = (formData: FormData) =>
  request.post('/quality/incoming-inspect-plans/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

export const approveIncomingInspectPlan = (id: string) =>
  request.put(`/quality/incoming-inspect-plans/${encodeURIComponent(id)}/approve`)

export const withdrawIncomingInspectPlan = (id: string) =>
  request.put(`/quality/incoming-inspect-plans/${encodeURIComponent(id)}/withdraw`)
