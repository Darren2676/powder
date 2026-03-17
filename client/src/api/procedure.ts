import request from '@/utils/request'
export const getProcedures = (params?: any) => request.get('/procedures', { params })
export const createProcedure = (data: any) => request.post('/procedures', data)
export const updateProcedure = (id: string, data: any) => request.put(`/procedures/${encodeURIComponent(id)}`, data)
export const deleteProcedure = (id: string) => request.delete(`/procedures/${encodeURIComponent(id)}`)
export const exportProcedures = (format: string = 'xlsx') => request.get('/procedures/export', { params: { format }, responseType: 'blob' })
export const importProcedures = (formData: FormData) => request.post('/procedures/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
