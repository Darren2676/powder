import request from '@/utils/request'

export function getScrapInboundOrders(params?: { page?: number; limit?: number; search?: string; approval_status?: string; factory_id?: number }) {
  return request.get('/quality/scrap-inbound-orders', { params })
}

export function getScrapInboundOrderDetail(stockInNumber: string) {
  return request.get(`/quality/scrap-inbound-orders/${stockInNumber}`)
}

export function createScrapInboundOrder(data: any) {
  return request.post('/quality/scrap-inbound-orders', data)
}

export function deleteScrapInboundOrder(stockInNumber: string) {
  return request.delete(`/quality/scrap-inbound-orders/${stockInNumber}`)
}
