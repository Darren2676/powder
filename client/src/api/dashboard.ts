import request from '@/utils/request';
import type { ApiResponse, DashboardStats } from '@/types';

/**
 * 获取仪表板统计数据
 */
export const getStats = () => {
  return request<ApiResponse<DashboardStats>>({
    url: '/dashboard/stats',
    method: 'GET'
  });
};

/**
 * 获取状态分布数据
 */
export const getStatusDistribution = () => {
  return request<ApiResponse<Record<string, number>>>({
    url: '/dashboard/status-distribution',
    method: 'GET'
  });
};

/**
 * 获取优先级分布数据
 */
export const getPriorityDistribution = () => {
  return request<ApiResponse<Record<string, number>>>({
    url: '/dashboard/priority-distribution',
    method: 'GET'
  });
};

/**
 * 获取处理人工作负载
 */
export const getAssigneeWorkload = () => {
  return request<ApiResponse<Array<{ name: string; count: number }>>>({
    url: '/dashboard/assignee-workload',
    method: 'GET'
  });
};

/**
 * 获取趋势数据
 */
export const getTrend = (startDate?: string, endDate?: string) => {
  return request<ApiResponse<Array<{ date: string; count: number }>>>({
    url: '/dashboard/trend',
    method: 'GET',
    params: { startDate, endDate }
  });
};

/**
 * 获取我的统计数据
 */
export const getMyStats = () => {
  return request<ApiResponse<{
    created: number;
    assigned: number;
    completed: number;
    pending: number;
  }>>({
    url: '/dashboard/my-stats',
    method: 'GET'
  });
};
