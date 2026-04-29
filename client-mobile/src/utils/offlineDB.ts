/**
 * IndexedDB 离线存储模块
 * 用于 APP 端离线场景：
 * 1. 离线请求队列 - 存储离线时的写操作，网络恢复后自动重放
 * 2. 离线数据缓存 - 缓存关键业务数据供离线查看
 */
import { openDB, type IDBPDatabase, type DBSchema } from 'idb'

// ==================== 类型定义 ====================

/** 离线请求记录 */
export interface OfflineRequest {
  id?: number
  /** 请求方法 */
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** 请求路径（不含 baseURL） */
  url: string
  /** 请求体 JSON */
  body: string
  /** 创建时间 */
  createdAt: number
  /** 重试次数 */
  retryCount: number
  /** 上次重试时间 */
  lastRetryAt?: number
  /** 请求描述（用于 UI 展示） */
  description: string
}

/** 离线请求状态 */
export type OfflineRequestStatus = 'pending' | 'syncing' | 'failed'

/** 带状态的离线请求 */
export interface OfflineRequestWithStatus extends OfflineRequest {
  status: OfflineRequestStatus
}

/** 缓存数据记录 */
export interface CachedData {
  key: string
  /** JSON 序列化的数据 */
  data: string
  /** 缓存时间戳 */
  cachedAt: number
  /** 过期时间（毫秒），0 表示永不过期 */
  ttl: number
}

/** 数据库 Schema */
interface MESOfflineDB extends DBSchema {
  requests: {
    key: number
    value: OfflineRequest
    indexes: { 'by-createdAt': number }
  }
  cache: {
    key: string
    value: CachedData
    indexes: { 'by-cachedAt': number }
  }
}

const DB_NAME = 'mes-offline'
const DB_VERSION = 1

// ==================== 数据库单例 ====================

let dbPromise: Promise<IDBPDatabase<MESOfflineDB>> | null = null

function getDB(): Promise<IDBPDatabase<MESOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MESOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 离线请求队列
        if (!db.objectStoreNames.contains('requests')) {
          const requestStore = db.createObjectStore('requests', {
            keyPath: 'id',
            autoIncrement: true,
          })
          requestStore.createIndex('by-createdAt', 'createdAt')
        }
        // 离线数据缓存
        if (!db.objectStoreNames.contains('cache')) {
          const cacheStore = db.createObjectStore('cache', {
            keyPath: 'key',
          })
          cacheStore.createIndex('by-cachedAt', 'cachedAt')
        }
      },
    })
  }
  return dbPromise
}

// ==================== 离线请求队列 API ====================

/** 添加离线请求到队列 */
export async function enqueueRequest(req: Omit<OfflineRequest, 'id' | 'createdAt' | 'retryCount'>): Promise<number> {
  const db = await getDB()
  const id = await db.add('requests', {
    ...req,
    createdAt: Date.now(),
    retryCount: 0,
  })
  return id as number
}

/** 获取所有待处理的离线请求（按时间排序） */
export async function getPendingRequests(): Promise<OfflineRequest[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('requests', 'by-createdAt')
  return all
}

/** 获取离线请求数量 */
export async function getPendingRequestCount(): Promise<number> {
  const db = await getDB()
  return db.count('requests')
}

/** 更新离线请求（重试计数等） */
export async function updateRequest(id: number, updates: Partial<OfflineRequest>): Promise<void> {
  const db = await getDB()
  const existing = await db.get('requests', id)
  if (existing) {
    await db.put('requests', { ...existing, ...updates })
  }
}

/** 删除已完成的离线请求 */
export async function removeRequest(id: number): Promise<void> {
  const db = await getDB()
  await db.delete('requests', id)
}

/** 清空所有离线请求 */
export async function clearAllRequests(): Promise<void> {
  const db = await getDB()
  await db.clear('requests')
}

// ==================== 离线数据缓存 API ====================

/** 存储缓存数据 */
export async function setCachedData(key: string, data: any, ttlMs: number = 5 * 60 * 1000): Promise<void> {
  const db = await getDB()
  await db.put('cache', {
    key,
    data: JSON.stringify(data),
    cachedAt: Date.now(),
    ttl: ttlMs,
  })
}

/** 获取缓存数据（过期返回 null） */
export async function getCachedData<T = any>(key: string): Promise<T | null> {
  const db = await getDB()
  const record = await db.get('cache', key)
  if (!record) return null

  // 检查是否过期
  if (record.ttl > 0 && Date.now() - record.cachedAt > record.ttl) {
    await db.delete('cache', key)
    return null
  }

  try {
    return JSON.parse(record.data) as T
  } catch {
    return null
  }
}

/** 删除指定缓存 */
export async function removeCachedData(key: string): Promise<void> {
  const db = await getDB()
  await db.delete('cache', key)
}

/** 清理过期缓存 */
export async function cleanExpiredCache(): Promise<number> {
  const db = await getDB()
  const all = await db.getAll('cache')
  const now = Date.now()
  let cleaned = 0
  const tx = db.transaction('cache', 'readwrite')
  for (const record of all) {
    if (record.ttl > 0 && now - record.cachedAt > record.ttl) {
      await tx.store.delete(record.key)
      cleaned++
    }
  }
  await tx.done
  return cleaned
}
