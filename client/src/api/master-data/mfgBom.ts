import request from '@/utils/request'

// Header CRUD
export const getMfgBomHeaders = (params?: any) => request.get('/mfg-boms', { params })
export const getMfgBomHeaderDetail = (id: string) => request.get(`/mfg-boms/${encodeURIComponent(id)}`)
export const createMfgBomHeader = (data: any) => request.post('/mfg-boms', data)
export const updateMfgBomHeader = (id: string, data: any) => request.put(`/mfg-boms/${encodeURIComponent(id)}`, data)
export const deleteMfgBomHeader = (id: string) => request.delete(`/mfg-boms/${encodeURIComponent(id)}`)

// Detail CRUD
export const getMfgBomDetails = (headerId: string) => request.get(`/mfg-boms/${encodeURIComponent(headerId)}/details`)
export const addMfgBomDetail = (headerId: string, data: any) => request.post(`/mfg-boms/${encodeURIComponent(headerId)}/details`, data)
export const updateMfgBomDetail = (detailId: number, data: any) => request.put(`/mfg-boms/details/${detailId}`, data)
export const deleteMfgBomDetail = (detailId: number) => request.delete(`/mfg-boms/details/${detailId}`)

// Export / Import
export const exportMfgBomData = (format: string = 'xlsx') => request.get('/mfg-boms/export', { params: { format }, responseType: 'blob' })
export const importMfgBomData = (formData: FormData) => request.post('/mfg-boms/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// Version Copy
export const copyMfgBomAsNewVersion = (id: string) => request.post(`/mfg-boms/${encodeURIComponent(id)}/copy-version`)

// Duplicate (主表+明细)
export const duplicateMfgBom = (id: string) => request.post(`/mfg-boms/${encodeURIComponent(id)}/duplicate`)

// Tree & Flatten
export const getMfgBomTree = (id: string) => request.get(`/mfg-boms/${encodeURIComponent(id)}/tree`)
export const getMfgBomFlatten = (id: string) => request.get(`/mfg-boms/${encodeURIComponent(id)}/flatten`)
export const checkMfgBomHasBom = (materialNumbers: string) => request.get('/mfg-boms/check-has-bom', { params: { material_numbers: materialNumbers } })

// Import from BOM
export const importFromBom = (data: { bom_number: string }) => request.post('/mfg-boms/import-from-bom', data)
