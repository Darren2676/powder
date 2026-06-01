import request from '@/utils/request'

export const getSalesPersonShippingReport = (params?: any) =>
  request({ url: '/sales-person-shipping-report', method: 'GET', params })

export const getSalesPersons = () =>
  request({ url: '/sales-person-shipping-report/sales-persons', method: 'GET' })

export const exportSalesPersonShippingReport = (params?: any) =>
  request({ url: '/sales-person-shipping-report/export', method: 'GET', params, responseType: 'blob' })
