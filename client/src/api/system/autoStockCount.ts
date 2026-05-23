import request from '@/utils/request';
import type { ApiResponse } from '@/types';

/** 手动触发自动盘点 */
export const triggerAutoStockCount = () => {
  return request<ApiResponse<any>>({
    url: '/auto-stock-count/trigger',
    method: 'POST',
  });
};
