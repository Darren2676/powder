import request from '@/utils/request'

// ==================== 生产质量报告 ====================

export function getProductionQualityReport(production_order_number: string) {
  return request.get(`/quality/quality-report/production/${production_order_number}`)
}

export function getQualitySummary(params?: {
  page?: number
  limit?: number
  search?: string
  start_date?: string
  end_date?: string
  item_number?: string
}) {
  return request.get('/quality/quality-report/summary', { params })
}

export function getDefectAnalysis(params?: {
  start_date?: string
  end_date?: string
  item_number?: string
  defect_class_name?: string
}) {
  return request.get('/quality/quality-report/defect-analysis', { params })
}

export function getProcessQuality(params?: {
  start_date?: string
  end_date?: string
  standard_process_name?: string
}) {
  return request.get('/quality/quality-report/process-quality', { params })
}

// ==================== 按产品质量汇总 ====================

export function getProductQualitySummary(params?: {
  page?: number
  limit?: number
  search?: string
  start_date?: string
  end_date?: string
}) {
  return request.get('/quality/quality-report/product-summary', { params })
}

// ==================== 综合合格率报表 ====================

export function getYieldRateReport(params?: {
  page?: number
  limit?: number
  search?: string
  start_date?: string
  end_date?: string
  item_number?: string
  plan_status?: string
}) {
  return request.get('/quality/quality-report/yield-rate', { params })
}

// ==================== 生产单质量透视报表 ====================

export function getProductionOrderQualityPivot(params?: {
  page?: number
  limit?: number
  search?: string
  start_date?: string
  end_date?: string
  item_number?: string
  plan_status?: string
}) {
  return request.get('/quality/quality-report/production-order-pivot', { params })
}

// ==================== 采购质量检验 ====================

export function createPurchaseInspection(data: {
  stock_in_number?: string
  purchase_order_number?: string
  supplier_number?: string
  supplier_name?: string
  item_number: string
  item_name?: string
  specifications?: string
  basic_unit?: string
  received_quantity?: number
  batch_number?: string
}) {
  return request.post('/quality/quality-report/purchase-inspection', data)
}

export function getPurchaseInspections(params?: {
  page?: number
  limit?: number
  search?: string
  supplier_number?: string
  inspect_status?: string
  start_date?: string
  end_date?: string
}) {
  return request.get('/quality/quality-report/purchase-inspections', { params })
}

export function getPurchaseInspectionDetail(inspection_number: string) {
  return request.get(`/quality/quality-report/purchase-inspections/${inspection_number}`)
}

export function updatePurchaseInspection(inspection_number: string, data: {
  qualified_quantity?: number
  unqualified_quantity?: number
  inspect_result?: string
  defect_class_name?: string
  defect_name?: string
  defect_reason_name?: string
  remark?: string
  details?: Array<{
    id: number
    actual_value: string
    is_qualified: string
    remark?: string
  }>
  defects?: Array<{
    defect_class_name: string
    defect_name: string
    defect_reason_name: string
    unqualified_quantity: number
    inspect_result: string
    remark?: string
  }>
}) {
  return request.put(`/quality/quality-report/purchase-inspections/${inspection_number}`, data)
}

export function completePurchaseInspection(inspection_number: string, data: {
  inspect_result: string
  qualified_quantity: number
  unqualified_quantity: number
}) {
  return request.put(`/quality/quality-report/purchase-inspections/${inspection_number}/complete`, data)
}

export function getPurchaseInspectionSummary(params?: {
  start_date?: string
  end_date?: string
  supplier_number?: string
}) {
  return request.get('/quality/quality-report/purchase-inspection-summary', { params })
}

export function defectHandlingPurchaseInspection(
  inspection_number: string,
  data: {
    defect_handling: string
    handling_quantity?: number
    handling_remark?: string
    return_order_number?: string
    special_warehouse?: string
    qualified_quantity?: number
    unqualified_quantity?: number
    defect_items?: Array<{
      id: number
      defect_handling: string
    }>
  }
) {
  return request.put(`/quality/quality-report/purchase-inspections/${inspection_number}/defect-handling`, data)
}

// 撤销不合格品处理
export function cancelDefectHandlingPurchaseInspection(inspection_number: string) {
  return request.put(`/quality/quality-report/purchase-inspections/${inspection_number}/cancel-defect-handling`)
}
