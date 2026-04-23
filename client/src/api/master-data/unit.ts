import request from '@/utils/request'

export const getUnits = (params?: any) => request.get('/units', { params })
export const getAllUnits = () => request.get('/units/all')
export const createUnit = (data: any) => request.post('/units', data)
export const updateUnit = (id: string, data: any) => request.put(`/units/${encodeURIComponent(id)}`, data)
export const deleteUnit = (id: string) => request.delete(`/units/${encodeURIComponent(id)}`)
export const exportUnits = (search?: string) => request.get('/units/export', { params: { search }, responseType: 'blob' })
export const importUnits = (formData: FormData) => request.post('/units/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const getUnitConversions = (id: string) => request.get(`/units/${encodeURIComponent(id)}/conversions`)
export const toggleUnitStatus = (id: string) => request.put(`/units/${encodeURIComponent(id)}/toggle-status`)
export const approveUnit = (id: string) => request.put(`/units/${encodeURIComponent(id)}/approve`)
export const withdrawUnit = (id: string) => request.put(`/units/${encodeURIComponent(id)}/withdraw`)

// 单位换算
export const getConversions = (params?: any) => request.get('/units/conversions', { params })
export const createConversion = (data: any) => request.post('/units/conversions', data)
export const updateConversion = (id: number, data: any) => request.put(`/units/conversions/${id}`, data)
export const deleteConversion = (id: number) => request.delete(`/units/conversions/${id}`)
export const convertUnit = (from: string, to: string) => request.get('/units/conversions/convert', { params: { from, to } })
