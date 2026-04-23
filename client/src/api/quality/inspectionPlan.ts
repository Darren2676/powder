import request from '@/utils/request'

export const getInspectionPlans = (params?: any) =>
  request.get('/inspection-plans', { params })

export const createInspectionPlan = (data: any) =>
  request.post('/inspection-plans', data)

export const updateInspectionPlan = (id: string, data: any) =>
  request.put(`/inspection-plans/${encodeURIComponent(id)}`, data)

export const deleteInspectionPlan = (id: string) =>
  request.delete(`/inspection-plans/${encodeURIComponent(id)}`)

export const exportInspectionPlans = () =>
  request.get('/inspection-plans/export', { responseType: 'blob' })

export const importInspectionPlans = (formData: FormData) =>
  request.post('/inspection-plans/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

export const approveInspectionPlan = (id: string) =>
  request.put(`/inspection-plans/${encodeURIComponent(id)}/approve`)

export const withdrawInspectionPlan = (id: string) =>
  request.put(`/inspection-plans/${encodeURIComponent(id)}/withdraw`)
