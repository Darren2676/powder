import request from '@/utils/request'
export const getDefectClasses = (params?: any) => request.get('/defect-classes', { params })
export const createDefectClass = (data: any) => request.post('/defect-classes', data)
export const updateDefectClass = (id: string, data: any) => request.put(`/defect-classes/${encodeURIComponent(id)}`, data)
export const deleteDefectClass = (id: string) => request.delete(`/defect-classes/${encodeURIComponent(id)}`)
export const exportDefectClasses = () => request.get('/defect-classes/export', { responseType: 'blob' })
export const importDefectClasses = (formData: FormData) => request.post('/defect-classes/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const approveDefectClass = (id: string) => request.put(`/defect-classes/${encodeURIComponent(id)}/approve`)
export const withdrawDefectClass = (id: string) => request.put(`/defect-classes/${encodeURIComponent(id)}/withdraw`)
