import request from '@/utils/request'
export const getDefects = (params?: any) => request.get('/quality/defects', { params })
export const createDefect = (data: any) => request.post('/quality/defects', data)
export const updateDefect = (id: string, data: any) => request.put(`/quality/defects/${encodeURIComponent(id)}`, data)
export const deleteDefect = (id: string) => request.delete(`/quality/defects/${encodeURIComponent(id)}`)
export const exportDefects = () => request.get('/quality/defects/export', { responseType: 'blob' })
export const importDefects = (formData: FormData) => request.post('/quality/defects/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const approveDefect = (id: string) => request.put(`/quality/defects/${encodeURIComponent(id)}/approve`)
export const withdrawDefect = (id: string) => request.put(`/quality/defects/${encodeURIComponent(id)}/withdraw`)
