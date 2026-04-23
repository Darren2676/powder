import request from '@/utils/request'
export const getDefects = (params?: any) => request.get('/defects', { params })
export const createDefect = (data: any) => request.post('/defects', data)
export const updateDefect = (id: string, data: any) => request.put(`/defects/${encodeURIComponent(id)}`, data)
export const deleteDefect = (id: string) => request.delete(`/defects/${encodeURIComponent(id)}`)
export const exportDefects = () => request.get('/defects/export', { responseType: 'blob' })
export const importDefects = (formData: FormData) => request.post('/defects/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const approveDefect = (id: string) => request.put(`/defects/${encodeURIComponent(id)}/approve`)
export const withdrawDefect = (id: string) => request.put(`/defects/${encodeURIComponent(id)}/withdraw`)
