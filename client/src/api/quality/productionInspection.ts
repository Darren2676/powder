import request from '@/utils/request'

export const getProductionInspections = (params?: any) =>
  request.get('/production-inspections', { params })

export const getProductionInspectionDetail = (id: string) =>
  request.get(`/production-inspections/${encodeURIComponent(id)}`)

export const getInspectionsByOrder = (orderNo: string) =>
  request.get(`/production-inspections/by-order/${encodeURIComponent(orderNo)}`)

export const updateProductionInspection = (id: string, data: any) =>
  request.put(`/production-inspections/${encodeURIComponent(id)}`, data)

export const completeInspection = (id: string) =>
  request.put(`/production-inspections/${encodeURIComponent(id)}/complete`)

export const defectHandling = (id: string, data: any) =>
  request.put(`/production-inspections/${encodeURIComponent(id)}/defect-handling`, data)

export const exportProductionInspections = () =>
  request.get('/production-inspections/export', { responseType: 'blob' })
