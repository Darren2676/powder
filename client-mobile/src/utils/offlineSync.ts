/**
 * 离线请求队列同步服务
 * 当网络恢复时，自动从 IndexedDB 读取队列中的写操作并重放
 */
import axios from 'axios'
import {
  getPendingRequests,
  removeRequest,
  updateRequest,
  type OfflineRequest,
} from '@/utils/offlineDB'

const MAX_RETRY = 3

/** 同步状态 */
let isSyncing = false

/** 事件回调 */
type SyncEventCallback = (event: string, data?: any) => void
const listeners = new Set<SyncEventCallback>()

export function onSyncEvent(cb: SyncEventCallback): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function emit(event: string, data?: any) {
  listeners.forEach(cb => {
    try { cb(event, data) } catch { /* ignore */ }
  })
}

/**
 * 同步离线请求队列
 * 逐条重放队列中的写操作，成功则删除，失败则增加重试计数
 */
export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 }
  isSyncing = true
  emit('sync-start')

  let synced = 0
  let failed = 0

  try {
    const requests = await getPendingRequests()
    if (requests.length === 0) {
      emit('sync-complete', { synced, failed })
      return { synced, failed }
    }

    for (const req of requests) {
      try {
        await axios({
          method: req.method,
          url: `/api/v1${req.url}`,
          data: req.body ? JSON.parse(req.body) : undefined,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
          timeout: 10000,
        })
        // 成功 - 从队列中删除
        if (req.id) await removeRequest(req.id)
        synced++
        emit('request-synced', { id: req.id, description: req.description })
      } catch (error: any) {
        // 失败 - 增加重试计数
        const newRetryCount = req.retryCount + 1
        if (newRetryCount >= MAX_RETRY) {
          // 超过最大重试次数，删除该请求
          if (req.id) await removeRequest(req.id)
          failed++
          emit('request-failed', { id: req.id, description: req.description, error: error.message })
        } else if (req.id) {
          await updateRequest(req.id, {
            retryCount: newRetryCount,
            lastRetryAt: Date.now(),
          })
        }
      }
    }
  } catch (error) {
    emit('sync-error', { error })
  } finally {
    isSyncing = false
    emit('sync-complete', { synced, failed })
  }

  return { synced, failed }
}

/**
 * 判断是否需要离线入队
 * 仅对写操作（POST/PUT/PATCH/DELETE）且特定业务路径入队
 */
const OFFLINE_ENABLED_PATHS = [
  '/work-reports',        // 报工
  '/material-preparations', // 备料
  '/process-tasks',        // 工序任务
]

export function shouldEnqueueOffline(method: string, url: string): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) return false
  return OFFLINE_ENABLED_PATHS.some(path => url.startsWith(path))
}
