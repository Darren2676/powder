import request from '@/utils/request'

/** 获取本地已同步的检验记录（分页搜索） */
export function getInspectRecords(params?: {
  page?: number
  limit?: number
  search?: string
  inspect_type?: string
  inspect_method?: string
}) {
  return request.get('/xhy-inspect/records', { params })
}

/** 测试新核云连接 */
export function testXhyConnection() {
  return request.get('/xhy-inspect/test')
}

/** 从新核云同步检验记录到本地 */
export function syncInspectRecords(data?: {
  conditions?: any
  batchSize?: number
  maxRecords?: number
}) {
  return request.post('/xhy-inspect/sync', data || {})
}

/** 直接从新核云标准查询 */
export function queryXhyInspectRecords(data: {
  conditions?: any
  sorts?: Array<{ sortOrder: string; sortFieldKey: string }>
  start?: number
  length?: number
}) {
  return request.post('/xhy-inspect/query', data)
}

/** 直接从新核云分批查询 */
export function searchAfterInspectRecords(data: {
  conditions?: any
  sorts?: Array<{ sortOrder: string; sortFieldKey: string }>
  boundaryIds?: string[]
  length?: number
}) {
  return request.post('/xhy-inspect/search-after', data)
}

// ==================== 检验明细行 ====================

/** 获取本地已同步的检验明细行（分页搜索） */
export function getInspectLines(params?: {
  page?: number
  limit?: number
  search?: string
  status?: string
  record_code?: string
}) {
  return request.get('/xhy-inspect/lines', { params })
}

/** 从新核云同步检验明细行到本地 */
export function syncInspectLines(data?: {
  conditions?: any
  batchSize?: number
  maxRecords?: number
}) {
  return request.post('/xhy-inspect/lines/sync', data || {})
}

/** 直接从新核云查询检验明细行 */
export function queryXhyInspectLines(data: {
  conditions?: any
  sorts?: Array<{ sortOrder: string; sortFieldKey: string }>
  start?: number
  length?: number
}) {
  return request.post('/xhy-inspect/lines/query', data)
}

// ==================== 检验报工汇总 ====================

/** 获取检验报工汇总（按生产单号聚合） */
export function getInspectSummary(params?: {
  page?: number
  limit?: number
  search?: string
  startDate?: string
  endDate?: string
}) {
  return request.get('/xhy-inspect/summary', { params })
}

// ==================== 库存明细查询 ====================

/** 查询新核云库存明细（实时查询） */
export function queryInventoryDetail(data: {
  itemCodes?: string[]
  warehouseCodes?: string[]
  warehouseBinCodes?: string[]
  batchCodes?: string[]
  snCodes?: string[]
}) {
  return request.post('/xhy-inspect/inventory/query', data)
}
