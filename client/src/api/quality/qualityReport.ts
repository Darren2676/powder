import request from '@/utils/request'

// ==================== 生产质量报告 ====================

export function getProductionQualityReport(production_order_number: string) {
  return request.get(`/quality-report/production/${production_order_number}`)
}

export function getQualitySummary(params?: {
  page?: number
  limit?: number
  search?: string
  start_date?: string
  end_date?: string
  item_number?: string
}) {
  return request.get('/quality-report/summary', { params })
}

export function getDefectAnalysis(params?: {
  start_date?: string
  end_date?: string
  item_number?: string
  defect_class_name?: string
}) {
  return request.get('/quality-report/defect-analysis', { params })
}

export function getProcessQuality(params?: {
  start_date?: string
  end_date?: string
  standard_process_name?: string
}) {
  return request.get('/quality-report/process-quality', { params })
}

// ==================== 按产品质量汇总 ====================

export function getProductQualitySummary(params?: {
  page?: number
  limit?: number
  search?: string
  start_date?: string
  end_date?: string
}) {
  return request.get('/quality-report/product-summary', { params })
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
  return request.post('/quality-report/purchase-inspection', data)
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
  return request.get('/quality-report/purchase-inspections', { params })
}

export function getPurchaseInspectionDetail(inspection_number: string) {
  return request.get(`/quality-report/purchase-inspections/${inspection_number}`)
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
}) {
  return request.put(`/quality-report/purchase-inspections/${inspection_number}`, data)
}

export function completePurchaseInspection(inspection_number: string, data: {
  inspect_result: string
  qualified_quantity: number
  unqualified_quantity: number
}) {
  return request.put(`/quality-report/purchase-inspections/${inspection_number}/complete`, data)
}

export function getPurchaseInspectionSummary(params?: {
  start_date?: string
  end_date?: string
  supplier_number?: string
}) {
  return request.get('/quality-report/purchase-inspection-summary', { params })
}
