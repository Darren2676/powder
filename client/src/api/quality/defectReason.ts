import request from '@/utils/request'
export const getDefectReasons = (params?: any) => request.get('/quality/defect-reasons', { params })
export const createDefectReason = (data: any) => request.post('/quality/defect-reasons', data)
export const updateDefectReason = (id: string, data: any) => request.put(`/quality/defect-reasons/${encodeURIComponent(id)}`, data)
export const deleteDefectReason = (id: string) => request.delete(`/quality/defect-reasons/${encodeURIComponent(id)}`)
export const exportDefectReasons = () => request.get('/quality/defect-reasons/export', { responseType: 'blob' })
export const importDefectReasons = (formData: FormData) => request.post('/quality/defect-reasons/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const approveDefectReason = (id: string) => request.put(`/quality/defect-reasons/${encodeURIComponent(id)}/approve`)
export const withdrawDefectReason = (id: string) => request.put(`/quality/defect-reasons/${encodeURIComponent(id)}/withdraw`)
