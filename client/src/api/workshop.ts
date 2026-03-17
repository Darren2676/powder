import request from '@/utils/request'
export const getWorkshops = (params?: any) => request.get('/workshops', { params })
export const createWorkshop = (data: any) => request.post('/workshops', data)
export const updateWorkshop = (id: string, data: any) => request.put(`/workshops/${encodeURIComponent(id)}`, data)
export const deleteWorkshop = (id: string) => request.delete(`/workshops/${encodeURIComponent(id)}`)
export const exportWorkshops = () => request.get('/workshops/export', { responseType: 'blob' })
export const importWorkshops = (formData: FormData) => request.post('/workshops/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
