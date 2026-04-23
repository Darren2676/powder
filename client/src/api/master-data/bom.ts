import request from '@/utils/request'

// Header CRUD
export const getBomHeaders = (params?: any) => request.get('/boms', { params })
export const getBomHeaderDetail = (id: string) => request.get(`/boms/${encodeURIComponent(id)}`)
export const createBomHeader = (data: any) => request.post('/boms', data)
export const updateBomHeader = (id: string, data: any) => request.put(`/boms/${encodeURIComponent(id)}`, data)
export const deleteBomHeader = (id: string) => request.delete(`/boms/${encodeURIComponent(id)}`)

// Detail CRUD
export const getBomDetails = (headerId: string) => request.get(`/boms/${encodeURIComponent(headerId)}/details`)
export const addBomDetail = (headerId: string, data: any) => request.post(`/boms/${encodeURIComponent(headerId)}/details`, data)
export const updateBomDetail = (detailId: number, data: any) => request.put(`/boms/details/${detailId}`, data)
export const deleteBomDetail = (detailId: number) => request.delete(`/boms/details/${detailId}`)

// Export / Import
export const exportBomData = (format: string = 'xlsx') => request.get('/boms/export', { params: { format }, responseType: 'blob' })
export const importBomData = (formData: FormData) => request.post('/boms/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// Version Copy
export const copyBomAsNewVersion = (id: string) => request.post(`/boms/${encodeURIComponent(id)}/copy-version`)

// Tree & Flatten
export const getBomTree = (id: string) => request.get(`/boms/${encodeURIComponent(id)}/tree`)
export const getBomFlatten = (id: string) => request.get(`/boms/${encodeURIComponent(id)}/flatten`)
export const checkMaterialHasBom = (materialNumbers: string) => request.get('/boms/check-has-bom', { params: { material_numbers: materialNumbers } })
