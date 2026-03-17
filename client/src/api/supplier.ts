import request from '@/utils/request'

export function getSuppliers(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/suppliers', { params })
}

export function createSupplier(data: any) {
  return request.post('/suppliers', data)
}

export function updateSupplier(supplierId: string, data: any) {
  return request.put(`/suppliers/${encodeURIComponent(supplierId)}`, data)
}

export function deleteSupplier(supplierId: string) {
  return request.delete(`/suppliers/${encodeURIComponent(supplierId)}`)
}

export function exportSuppliers() {
  return request.get('/suppliers/export', { responseType: 'blob' })
}

export function importSuppliers(formData: FormData) {
  return request.post('/suppliers/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
