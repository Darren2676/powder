import request from '@/utils/request'

export function getProducts(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/products', { params })
}

export function createProduct(data: any) {
  return request.post('/products', data)
}

export function updateProduct(itemNumber: string, data: any) {
  return request.put(`/products/${itemNumber}`, data)
}

export function deleteProduct(itemNumber: string) {
  return request.delete(`/products/${itemNumber}`)
}

export function exportProducts(search?: string) {
  return request.get('/products/export', {
    params: { search },
    responseType: 'blob'
  })
}

export function importProducts(formData: FormData) {
  return request.post('/products/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
