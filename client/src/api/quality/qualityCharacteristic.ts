import request from '@/utils/request'
export const getQualityCharacteristics = (params?: any) => request.get('/quality-characteristics', { params })
export const createQualityCharacteristic = (data: any) => request.post('/quality-characteristics', data)
export const updateQualityCharacteristic = (id: string, data: any) => request.put(`/quality-characteristics/${encodeURIComponent(id)}`, data)
export const deleteQualityCharacteristic = (id: string) => request.delete(`/quality-characteristics/${encodeURIComponent(id)}`)
export const exportQualityCharacteristics = () => request.get('/quality-characteristics/export', { responseType: 'blob' })
export const importQualityCharacteristics = (formData: FormData) => request.post('/quality-characteristics/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const approveQualityCharacteristic = (id: string) => request.put(`/quality-characteristics/${encodeURIComponent(id)}/approve`)
export const withdrawQualityCharacteristic = (id: string) => request.put(`/quality-characteristics/${encodeURIComponent(id)}/withdraw`)
