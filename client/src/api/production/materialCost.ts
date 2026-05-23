import request from '@/utils/request';

export const getProductionMaterialCost = (params?: any) =>
  request({ url: '/production-material-cost', method: 'GET', params });

export const getProductionMaterialCostSummary = () =>
  request({ url: '/production-material-cost/summary', method: 'GET' });

export const exportProductionMaterialCost = (params?: any) =>
  request({ url: '/production-material-cost/export', method: 'GET', params, responseType: 'blob' });
