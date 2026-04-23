import { defineStore } from 'pinia';
import { ref } from 'vue';
import * as notificationApi from '@/api/system/notification';
import { useAuthStore } from './auth';

export const useNotificationStore = defineStore('notification', () => {
  // State
  const unreadCount = ref<number>(0);
  const pollingInterval = ref<number | null>(null);

  // Actions
  
  /**
   * 获取未读通知数量
   */
  const fetchUnreadCount = async () => {
    try {
      const response: any = await notificationApi.getUnreadCount();
      if (response.success) {
        unreadCount.value = response.data.count;
      }
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  /**
   * 标记通知为已读
   */
  const markAsRead = async (id: number) => {
    try {
      const response: any = await notificationApi.markAsRead(id);
      if (response.success) {
        // Decrease unread count
        if (unreadCount.value > 0) {
          unreadCount.value--;
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to mark as read:', error);
      return false;
    }
  };

  /**
   * 标记所有通知为已读
   */
  const markAllAsRead = async () => {
    try {
      const response: any = await notificationApi.markAllAsRead();
      if (response.success) {
        unreadCount.value = 0;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      return false;
    }
  };

  /**
   * 开始轮询未读通知数量
   */
  const startPolling = () => {
    const authStore = useAuthStore();
    
    // Only poll if user is logged in
    if (!authStore.isLoggedIn) {
      return;
    }

    // Fetch immediately
    fetchUnreadCount();

    // Set up polling interval (every 30 seconds)
    if (!pollingInterval.value) {
      pollingInterval.value = window.setInterval(() => {
        if (authStore.isLoggedIn) {
          fetchUnreadCount();
        } else {
          stopPolling();
        }
      }, 30000); // 30 seconds
    }
  };

  /**
   * 停止轮询
   */
  const stopPolling = () => {
    if (pollingInterval.value) {
      clearInterval(pollingInterval.value);
      pollingInterval.value = null;
    }
    unreadCount.value = 0;
  };

  /**
   * 重置状态
   */
  const reset = () => {
    stopPolling();
    unreadCount.value = 0;
  };

  return {
    // State
    unreadCount,
    
    // Actions
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    startPolling,
    stopPolling,
    reset
  };
});
