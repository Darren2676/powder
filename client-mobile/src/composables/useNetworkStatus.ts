/**
 * 网络状态检测 composable
 * 提供响应式的在线/离线状态，网络恢复时自动触发离线队列同步
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { syncOfflineQueue, onSyncEvent } from '@/utils/offlineSync'
import { getPendingRequestCount } from '@/utils/offlineDB'

export function useNetworkStatus() {
  const isOnline = ref(navigator.onLine)
  const pendingCount = ref(0)
  const isSyncing = ref(false)
  const lastSyncResult = ref<{ synced: number; failed: number } | null>(null)

  // 网络状态变化处理
  const handleOnline = async () => {
    isOnline.value = true
    // 网络恢复 - 自动同步离线队列
    try {
      isSyncing.value = true
      const result = await syncOfflineQueue()
      lastSyncResult.value = result
      // 更新待处理数量
      pendingCount.value = await getPendingRequestCount()
    } finally {
      isSyncing.value = false
    }
  }

  const handleOffline = () => {
    isOnline.value = false
  }

  // 刷新待处理数量
  const refreshPendingCount = async () => {
    pendingCount.value = await getPendingRequestCount()
  }

  // 手动触发同步
  const manualSync = async () => {
    if (!isOnline.value || isSyncing.value) return
    try {
      isSyncing.value = true
      const result = await syncOfflineQueue()
      lastSyncResult.value = result
      pendingCount.value = await getPendingRequestCount()
    } finally {
      isSyncing.value = false
    }
  }

  // 监听同步事件
  const unsubscribe = onSyncEvent((event, data) => {
    if (event === 'sync-complete') {
      pendingCount.value = data?.synced > 0 ? 0 : pendingCount.value
    }
  })

  onMounted(async () => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    await refreshPendingCount()
  })

  onUnmounted(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    unsubscribe()
  })

  return {
    isOnline,
    isOffline: isOnline, // 模板中可用 !isOffline 或 computed
    pendingCount,
    isSyncing,
    lastSyncResult,
    manualSync,
    refreshPendingCount,
  }
}
