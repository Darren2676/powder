import request from '@/utils/request'

export const getSuppliers = (params?: any) => request.get('/suppliers', { params })
export const getSupplierDetail = (supplierId: string) => request.get(`/suppliers/${encodeURIComponent(supplierId)}`)
export const createSupplier = (data: any) => request.post('/suppliers', data)
export const updateSupplier = (supplierId: string, data: any) => request.put(`/suppliers/${encodeURIComponent(supplierId)}`, data)
export const updateSupplierCondition = (supplierId: string, data: any) => request.put(`/suppliers/${encodeURIComponent(supplierId)}/condition`, data)
export const deleteSupplier = (supplierId: string) => request.delete(`/suppliers/${encodeURIComponent(supplierId)}`)
export const approveSupplier = (supplierId: string) => request.put(`/suppliers/${encodeURIComponent(supplierId)}/approve`)
export const withdrawSupplier = (supplierId: string) => request.put(`/suppliers/${encodeURIComponent(supplierId)}/withdraw`)
export const exportSuppliers = (format: string = 'xlsx') => request.get('/suppliers/export', { params: { format }, responseType: 'blob' })
export const importSuppliers = (formData: FormData) => request.post('/suppliers/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// 地址
export const addSupplierAddress = (supplierId: string, data: any) => request.post(`/suppliers/${encodeURIComponent(supplierId)}/addresses`, data)
export const updateSupplierAddress = (addressId: number, data: any) => request.put(`/suppliers/address/${addressId}`, data)
export const removeSupplierAddress = (addressId: number) => request.delete(`/suppliers/address/${addressId}`)

// 附件
export const uploadSupplierAttachment = (supplierId: string, formData: FormData) => request.post(`/suppliers/${encodeURIComponent(supplierId)}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const downloadSupplierAttachment = (attachmentId: number) => request.get(`/suppliers/attachment/${attachmentId}/download`, { responseType: 'blob' })
export const removeSupplierAttachment = (attachmentId: number) => request.delete(`/suppliers/attachment/${attachmentId}`)
