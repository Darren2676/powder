import request from '@/utils/request'

export const getScrapOrders = (params?: any) =>
  request.get('/scrap-orders', { params })

export const getScrapOrderDetail = (stockInNumber: string) =>
  request.get(`/scrap-orders/${encodeURIComponent(stockInNumber)}`)

export const exportScrapOrders = () =>
  request.get('/scrap-orders/export', { responseType: 'blob' })
