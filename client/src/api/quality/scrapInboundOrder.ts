import request from '@/utils/request'

export function getScrapInboundOrders(params?: any) {
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
