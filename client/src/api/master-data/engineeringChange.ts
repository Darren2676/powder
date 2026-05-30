import request from '@/utils/request'

const BASE = '/engineering-change-lifecycles'

// ==================== 主表（产品生命周期） ====================
export function getLifecycles(params?: any) {
  return request.get(BASE, { params })
}

export function getLifecycleDetail(id: number | string) {
  return request.get(`${BASE}/${id}`)
}

export function createLifecycle(data: any) {
  return request.post(BASE, data)
}

export function updateLifecycle(id: number | string, data: any) {
  return request.put(`${BASE}/${id}`, data)
}

export function updateLifecycleStatus(id: number | string, lifecycle_status: string) {
  return request.patch(`${BASE}/${id}/status`, { lifecycle_status })
}

export function deleteLifecycle(id: number | string) {
  return request.delete(`${BASE}/${id}`)
}

export function getChangeTypes() {
  return request.get(`${BASE}/change-types`)
}

// ==================== 变更日志（子表） ====================
export function getLogs(lifecycleId: number | string) {
  return request.get(`${BASE}/${lifecycleId}/logs`)
}

export function createLog(lifecycleId: number | string, data: any) {
  return request.post(`${BASE}/${lifecycleId}/logs`, data)
}

export function updateLog(lifecycleId: number | string, logId: number | string, data: any) {
  return request.put(`${BASE}/${lifecycleId}/logs/${logId}`, data)
}

export function deleteLog(lifecycleId: number | string, logId: number | string) {
  return request.delete(`${BASE}/${lifecycleId}/logs/${logId}`)
}
