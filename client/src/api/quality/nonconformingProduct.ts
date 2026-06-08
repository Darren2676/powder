import request from '@/utils/request'

export const getNonconformingProducts = (params?: any) =>
  request.get('/quality/nonconforming-products', { params })

export const getNonconformingProductDetail = (id: string) =>
  request.get(`/quality/nonconforming-products/${encodeURIComponent(id)}`)

export const handleNonconforming = (id: string, data: any) =>
  request.put(`/quality/nonconforming-products/${encodeURIComponent(id)}/handle`, data)

export const cancelHandleNonconforming = (id: string) =>
  request.put(`/quality/nonconforming-products/${encodeURIComponent(id)}/cancel-handle`)

export const exportNonconformingProducts = (params?: any) =>
  request.get('/quality/nonconforming-products/export', { params, responseType: 'blob' })
