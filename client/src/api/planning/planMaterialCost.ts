import request from '@/utils/request'

export const getPlanMaterialCost = (params?: any) =>
  request({ url: '/plan-material-cost', method: 'GET', params })

export const getPlanMaterialCostSummary = () =>
  request({ url: '/plan-material-cost/summary', method: 'GET' })

export const exportPlanMaterialCost = (params?: any) =>
  request({ url: '/plan-material-cost/export', method: 'GET', params, responseType: 'blob' })
