import request from '@/utils/request'

export const getProductionInspections = (params?: any) =>
  request.get('/quality/production-inspections', { params })

export const getProductionInspectionDetail = (id: string) =>
  request.get(`/quality/production-inspections/${encodeURIComponent(id)}`)

export const getInspectionsByOrder = (orderNo: string) =>
  request.get(`/quality/production-inspections/by-order/${encodeURIComponent(orderNo)}`)

export const updateProductionInspection = (id: string, data: any) =>
  request.put(`/quality/production-inspections/${encodeURIComponent(id)}`, data)

export const completeInspection = (id: string, data?: any) =>
  request.put(`/quality/production-inspections/${encodeURIComponent(id)}/complete`, data || {})

export const defectHandling = (id: string, data: any) =>
  request.put(`/quality/production-inspections/${encodeURIComponent(id)}/defect-handling`, data)

export const deleteProductionInspection = (id: string) =>
  request.delete(`/quality/production-inspections/${encodeURIComponent(id)}`)

export const exportProductionInspections = (factory_id?: number) =>
  request.get('/quality/production-inspections/export', { params: factory_id ? { factory_id } : {}, responseType: 'blob' })
