import request from '@/utils/request'
export const getProductionlines = (params?: any) => request.get('/productionlines', { params })
export const createProductionline = (data: any) => request.post('/productionlines', data)
export const updateProductionline = (id: string, data: any) => request.put(`/productionlines/${encodeURIComponent(id)}`, data)
export const deleteProductionline = (id: string) => request.delete(`/productionlines/${encodeURIComponent(id)}`)
export const exportProductionlines = () => request.get('/productionlines/export', { responseType: 'blob' })
export const importProductionlines = (formData: FormData) => request.post('/productionlines/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
