import request from '@/utils/request'

// ==================== 标签模板 ====================
export function getLabelTemplates(params?: { page?: number; limit?: number; search?: string; is_active?: string }) {
  return request.get('/label-templates', { params })
}

export function getLabelTemplateDetail(id: number) {
  return request.get(`/label-templates/${id}`)
}

export function createLabelTemplate(data: any) {
  return request.post('/label-templates', data)
}

export function updateLabelTemplate(id: number, data: any) {
  return request.put(`/label-templates/${id}`, data)
}

export function deleteLabelTemplate(id: number) {
  return request.delete(`/label-templates/${id}`)
}

export function getLabelTemplatePresetFields() {
  return request.get('/label-templates/preset-fields')
}

// ==================== 产品标签方案 ====================
export function getProductLabelSchemes(params?: { page?: number; limit?: number; search?: string; item_number?: string; customer_number?: string; is_active?: string }) {
  return request.get('/product-label-schemes', { params })
}

export function getProductLabelSchemeDetail(id: number) {
  return request.get(`/product-label-schemes/${id}`)
}

export function createProductLabelScheme(data: any) {
  return request.post('/product-label-schemes', data)
}

export function updateProductLabelScheme(id: number, data: any) {
  return request.put(`/product-label-schemes/${id}`, data)
}

export function deleteProductLabelScheme(id: number) {
  return request.delete(`/product-label-schemes/${id}`)
}

export function matchLabelScheme(params: { item_number: string; customer_number?: string }) {
  return request.get('/product-label-schemes/match', { params })
}

// ==================== 标签打印 ====================
export function previewLabel(data: any) {
  return request.post('/label-print/preview', data)
}

export function printLabel(data: any) {
  return request.post('/label-print/print', data)
}

export function getLabelPrintLogs(params?: { page?: number; limit?: number; search?: string; item_number?: string; start_date?: string; end_date?: string }) {
  return request.get('/label-print/logs', { params })
}
