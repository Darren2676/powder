import request from '@/utils/request'

export const getNonconformingProducts = (params?: any) =>
  request.get('/nonconforming-products', { params })

export const getNonconformingProductDetail = (id: string) =>
  request.get(`/nonconforming-products/${encodeURIComponent(id)}`)

export const handleNonconforming = (id: string, data: any) =>
  request.put(`/nonconforming-products/${encodeURIComponent(id)}/handle`, data)

export const exportNonconformingProducts = () =>
  request.get('/nonconforming-products/export', { responseType: 'blob' })
