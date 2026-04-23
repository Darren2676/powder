import request from '@/utils/request';
import type { 
  ApiResponse, 
  PaginatedData, 
  Notification, 
  NotificationQueryParams 
} from '@/types';

/**
 * 获取通知列表
 */
export const getNotifications = (params?: NotificationQueryParams) => {
  return request<ApiResponse<PaginatedData<Notification>>>({
    url: '/notifications',
    method: 'GET',
    params
  });
};

/**
 * 获取未读通知数量
 */
export const getUnreadCount = () => {
  return request<ApiResponse<{ count: number }>>({
    url: '/notifications/unread-count',
    method: 'GET'
  });
};

/**
 * 标记通知为已读
 */
export const markAsRead = (id: number) => {
  return request<ApiResponse<Notification>>({
    url: `/notifications/${id}/read`,
    method: 'PUT'
  });
};

/**
 * 标记所有通知为已读
 */
export const markAllAsRead = () => {
  return request<ApiResponse<void>>({
    url: '/notifications/read-all',
    method: 'PUT'
  });
};

/**
 * 删除通知
 */
export const deleteNotification = (id: number) => {
  return request<ApiResponse<void>>({
    url: `/notifications/${id}`,
    method: 'DELETE'
  });
};
