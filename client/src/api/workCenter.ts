import request from '@/utils/request'
export const getWorkCenters = (params?: any) => request.get('/work-centers', { params })
export const createWorkCenter = (data: any) => request.post('/work-centers', data)
export const updateWorkCenter = (id: string, data: any) => request.put(`/work-centers/${encodeURIComponent(id)}`, data)
export const deleteWorkCenter = (id: string) => request.delete(`/work-centers/${encodeURIComponent(id)}`)
export const exportWorkCenters = (format: string = 'xlsx') => request.get('/work-centers/export', { params: { format }, responseType: 'blob' })
export const importWorkCenters = (formData: FormData) => request.post('/work-centers/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
