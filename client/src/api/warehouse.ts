import request from '@/utils/request'

export const getWarehouses = (params?: any) => request.get('/warehouses', { params })
export const createWarehouse = (data: any) => request.post('/warehouses', data)
export const updateWarehouse = (id: string, data: any) => request.put(`/warehouses/${encodeURIComponent(id)}`, data)
export const deleteWarehouse = (id: string) => request.delete(`/warehouses/${encodeURIComponent(id)}`)
export const exportWarehouses = (format: string = 'xlsx') => request.get('/warehouses/export', { params: { format }, responseType: 'blob' })
export const importWarehouses = (formData: FormData) => request.post('/warehouses/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
