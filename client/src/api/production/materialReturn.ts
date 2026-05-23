import request from '@/utils/request'

// 创建退料单
export function createMaterialReturn(data: {
  issue_number: string
  items: Array<{
    material_number: string
    material_name?: string
    material_type?: string
    unit?: string
    return_quantity: number
    batch_number?: string
    step_number?: number | null
    work_center_name?: string
    default_warehouse?: string
    remark?: string
  }>
  remark?: string
}) {
  return request.post('/material-returns', data)
}

// 退料单列表
export function getMaterialReturns(params?: {
  page?: number
  limit?: number
  search?: string
  production_order_number?: string
  issue_number?: string
}) {
  return request.get('/material-returns', { params })
}

// 退料单详情
export function getMaterialReturnDetail(returnNumber: string) {
  return request.get(`/material-returns/${encodeURIComponent(returnNumber)}`)
}

// 撤回退料单
export function deleteMaterialReturn(returnNumber: string) {
  return request.delete(`/material-returns/${encodeURIComponent(returnNumber)}`)
}
