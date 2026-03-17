import request from '@/utils/request'
export const getRoutings = (params?: any) => request.get('/routings', { params })
export const createRouting = (data: any) => request.post('/routings', data)
export const updateRouting = (id: string, data: any) => request.put(`/routings/${encodeURIComponent(id)}`, data)
export const deleteRouting = (id: string) => request.delete(`/routings/${encodeURIComponent(id)}`)
export const exportRoutings = () => request.get('/routings/export', { responseType: 'blob' })
export const importRoutings = (formData: FormData) => request.post('/routings/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
