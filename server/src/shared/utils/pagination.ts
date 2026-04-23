// 统一分页工具函数

export interface PaginationParams {
  page?: number
  limit?: number
}

export interface PaginationResult {
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * 从请求 query 中解析分页参数
 * @param query Express req.query 对象
 * @returns offset, limit, page, pageSize
 */
export function parsePagination(query: any): { offset: number; limit: number; page: number; pageSize: number } {
  const page = Math.max(1, parseInt(query.page as string) || 1)
  const pageSize = Math.max(1, parseInt(query.limit as string) || 20)
  return { offset: (page - 1) * pageSize, limit: pageSize, page, pageSize }
}

/**
 * 构建分页结果对象
 * @param total 总记录数
 * @param page 当前页码
 * @param pageSize 每页条数
 * @returns PaginationResult
 */
export function buildPaginationResult(total: number, page: number, pageSize: number): PaginationResult {
  return { total, page, limit: pageSize, totalPages: Math.ceil(total / pageSize) }
}
