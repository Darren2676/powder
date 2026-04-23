import request from '@/utils/request'

export const getStorageLocations = (params?: any) => request.get('/storage-locations', { params })
export const createStorageLocation = (data: any) => request.post('/storage-locations', data)
export const updateStorageLocation = (id: number, data: any) => request.put(`/storage-locations/${id}`, data)
export const deleteStorageLocation = (id: number) => request.delete(`/storage-locations/${id}`)
export const exportStorageLocations = (format: string = 'xlsx') => request.get('/storage-locations/export', { params: { format }, responseType: 'blob' })
export const importStorageLocations = (formData: FormData) => request.post('/storage-locations/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const toggleStorageLocationStatus = (id: number) => request.put(`/storage-locations/${id}/toggle-status`)
export const approveStorageLocation = (id: number) => request.put(`/storage-locations/${id}/approve`)
export const withdrawStorageLocation = (id: number) => request.put(`/storage-locations/${id}/withdraw`)
