import request from '@/utils/request'

export const getOutsourcingPriceLists = (params: any) => {
  return request.get('/outsourcing-prices', { params })
}

export const getOutsourcingPriceListDetail = (id: string) => {
  return request.get(`/outsourcing-prices/${encodeURIComponent(id)}`)
}

export const createOutsourcingPriceList = (data: any) => {
  return request.post('/outsourcing-prices', data)
}

export const updateOutsourcingPriceList = (id: string, data: any) => {
  return request.put(`/outsourcing-prices/${encodeURIComponent(id)}`, data)
}

export const deleteOutsourcingPriceList = (id: string) => {
  return request.delete(`/outsourcing-prices/${encodeURIComponent(id)}`)
}

export const exportOutsourcingPriceLists = (search?: string) => {
  return request.get('/outsourcing-prices/export', { params: { search }, responseType: 'blob' })
}

export const importOutsourcingPriceList = (formData: FormData) => {
  return request.post('/outsourcing-prices/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
