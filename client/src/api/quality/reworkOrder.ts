import request from '@/utils/request'

export const getReworkOrders = (params?: any) =>
  request.get('/rework-orders', { params })

export const getReworkOrderDetail = (id: string) =>
  request.get(`/rework-orders/${encodeURIComponent(id)}`)

export const completeRework = (id: string, data?: any) =>
  request.post(`/rework-orders/${encodeURIComponent(id)}/complete`, data)

export const reworkReInspect = (id: string, data: any) =>
  request.post(`/rework-orders/${encodeURIComponent(id)}/re-inspect`, data)

export const exportReworkOrders = () =>
  request.get('/rework-orders/export/list', { responseType: 'blob' })
