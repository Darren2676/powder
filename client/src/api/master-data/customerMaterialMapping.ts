import request from '@/utils/request'

export function getCustomerMaterialMappings(params?: { page?: number; limit?: number; search?: string; customer_number?: string; item_number?: string; approval_status?: string }) {
  return request.get('/customer-material-mappings', { params })
}

export function getCustomerMaterialMappingDetail(id: number) {
  return request.get(`/customer-material-mappings/${id}`)
}

export function createCustomerMaterialMapping(data: any) {
  return request.post('/customer-material-mappings', data)
}

export function updateCustomerMaterialMapping(id: number, data: any) {
  return request.put(`/customer-material-mappings/${id}`, data)
}

export function deleteCustomerMaterialMapping(id: number) {
  return request.delete(`/customer-material-mappings/${id}`)
}

// 正向查询：根据客户编号和产品编号获取客户物料号和描述
export function lookupCustomerItemInfo(params: { customer_number: string; item_number: string }) {
  return request.get('/customer-material-mappings', { params })
}

// 反向查询：根据客户编号和客户物料号获取产品信息
export function reverseLookupProduct(params: { customer_number: string; customer_item_number: string }) {
  return request.get('/customer-material-mappings/reverse-lookup', { params })
}

export function approveCustomerMaterialMapping(id: number) {
  return request.put(`/customer-material-mappings/${id}/approve`)
}

export function withdrawCustomerMaterialMapping(id: number) {
  return request.put(`/customer-material-mappings/${id}/withdraw`)
}

export function exportCustomerMaterialMappings() {
  return request.get('/customer-material-mappings/export', { responseType: 'blob' })
}

export function importCustomerMaterialMappings(formData: FormData) {
  return request.post('/customer-material-mappings/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
