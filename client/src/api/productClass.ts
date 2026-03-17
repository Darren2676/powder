import request from '@/utils/request'

export function getProductClasses(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/product-classes', { params })
}

export function createProductClass(data: any) {
  return request.post('/product-classes', data)
}

export function updateProductClass(id: string, data: any) {
  return request.put(`/product-classes/${encodeURIComponent(id)}`, data)
}

export function deleteProductClass(id: string) {
  return request.delete(`/product-classes/${encodeURIComponent(id)}`)
}

export function exportProductClasses(search?: string) {
  return request.get('/product-classes/export', { params: { search }, responseType: 'blob' })
}

export function importProductClasses(formData: FormData) {
  return request.post('/product-classes/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
