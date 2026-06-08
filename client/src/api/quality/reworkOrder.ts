import request from '@/utils/request'

export const getReworkOrders = (params?: any) =>
  request.get('/quality/rework-orders', { params })

export const getReworkOrderDetail = (id: string) =>
  request.get(`/quality/rework-orders/${encodeURIComponent(id)}`)

export const completeRework = (id: string, data?: any) =>
  request.post(`/quality/rework-orders/${encodeURIComponent(id)}/complete`, data)

export const reworkReInspect = (id: string, data: any) =>
  request.post(`/quality/rework-orders/${encodeURIComponent(id)}/re-inspect`, data)

export const exportReworkOrders = (factory_id?: number) =>
  request.get('/quality/rework-orders/export/list', { params: factory_id ? { factory_id } : {}, responseType: 'blob' })
