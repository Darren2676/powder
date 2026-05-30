import request from '@/utils/request';

export const getBackflushTasks = (params?: any) =>
  request({ url: '/backflush-tasks', method: 'GET', params });

export const getBackflushTaskDetail = (id: number) =>
  request({ url: `/backflush-tasks/${id}/details`, method: 'GET' });

export const getBackflushSummary = (orderNo: string) =>
  request({ url: `/backflush-tasks/summary/${orderNo}`, method: 'GET' });

export const generateBackflushTasks = (productionOrderNumbers: string[]) =>
  request({ url: '/backflush-tasks/generate', method: 'POST', data: { production_order_numbers: productionOrderNumbers } });

export const retryDeduction = (id: number) =>
  request({ url: `/backflush-tasks/${id}/retry`, method: 'POST' });

export const exportBackflushTasks = (params?: any) =>
  request({ url: '/backflush-tasks/export', method: 'GET', params, responseType: 'blob' });

export const checkBackflushReadiness = (orderNo: string, inboundQty?: number) =>
  request({ url: `/backflush-tasks/readiness/${orderNo}`, method: 'GET', params: { inboundQty } });

export const updateAutoWeigh = (ids: number[], autoWeigh: string) =>
  request({ url: '/backflush-tasks/auto-weigh', method: 'PATCH', data: { ids, auto_weigh: autoWeigh } });
