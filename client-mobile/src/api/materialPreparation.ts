import request from './request'

/** 获取备料单列表 */
export function getMaterialPreparations(params?: {
  page?: number
  limit?: number
  search?: string
  preparation_status?: string
  approval_status?: string
}) {
  return request.get('/material-preparations', { params })
}

/** 获取备料单明细 */
export function getPreparationDetails(prepNumber: string) {
  return request.get(`/material-preparations/${encodeURIComponent(prepNumber)}/details`)
}

/** 获取备料单明细（按工序分组） */
export function getPreparationDetailsGrouped(prepNumber: string) {
  return request.get(`/material-preparations/${encodeURIComponent(prepNumber)}/details-grouped`)
}

/** 更新备料单明细（确认领料） */
export function updatePreparationDetails(prepNumber: string, details: any[]) {
  return request.put(`/material-preparations/${encodeURIComponent(prepNumber)}/details`, { details })
}

/** 从生产单生成备料单 */
export function generateFromOrder(productionOrderNumbers: string[]) {
  return request.post('/material-preparations/generate-from-order', { production_order_numbers: productionOrderNumbers })
}

/** 获取可按工序备料的生产单列表（已审批+已派发） */
export function getOrdersForProcessPrep(params?: {
  page?: number
  limit?: number
  search?: string
}) {
  return request.get('/material-preparations/orders-for-generate', {
    params: { ...params, plan_status: '已派发' }
  })
}

/** 按工序生成备料单 */
export function generateByProcess(productionOrderNumbers: string[]) {
  return request.post('/material-preparations/generate-by-process', {
    production_order_numbers: productionOrderNumbers
  })
}

/** 获取生产单的工序备料状态 */
export function getProcessPrepStatus(orderNo: string) {
  return request.get(`/material-preparations/process-prep-status/${encodeURIComponent(orderNo)}`)
}

/** 创建领料记录（与PC端"生产备料"相同） */
export function createMaterialIssue(data: {
  preparation_number: string
  production_order_number: string
  remark?: string
  items: Array<{
    preparation_detail_id: number
    material_number: string
    material_name: string
    material_type: string
    unit: string
    required_quantity: number
    actual_quantity: number
    batch_number: string
    step_number: number | null
    work_center_name: string
    is_key_material: number
    default_warehouse: string
  }>
}) {
  return request.post('/material-issues', data)
}
