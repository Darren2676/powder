import request from '@/utils/request'
export const getEmployees = (params?: any) => request.get('/employees', { params })
export const createEmployee = (data: any) => request.post('/employees', data)
export const updateEmployee = (id: string, data: any) => request.put(`/employees/${encodeURIComponent(id)}`, data)
export const deleteEmployee = (id: string) => request.delete(`/employees/${encodeURIComponent(id)}`)
export const exportEmployees = () => request.get('/employees/export', { responseType: 'blob' })
export const importEmployees = (formData: FormData) => request.post('/employees/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
