import request from '@/utils/request'
export const getGroups = (params?: any) => request.get('/groups', { params })
export const createGroup = (data: any) => request.post('/groups', data)
export const updateGroup = (id: string, data: any) => request.put(`/groups/${encodeURIComponent(id)}`, data)
export const deleteGroup = (id: string) => request.delete(`/groups/${encodeURIComponent(id)}`)
export const exportGroups = () => request.get('/groups/export', { responseType: 'blob' })
export const importGroups = (formData: FormData) => request.post('/groups/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
