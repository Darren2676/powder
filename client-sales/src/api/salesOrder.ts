import request from './request'

// ==================== Header ====================

export function getSalesOrders(params?: any) {
  return request.get('/sales-orders', { params })
}

export function getSalesOrderDetail(id: string) {
  return request.get(`/sales-orders/${encodeURIComponent(id)}`)
}

export function createSalesOrder(data: any) {
  return request.post('/sales-orders', data)
}

export function updateSalesOrder(id: string, data: any) {
  return request.put(`/sales-orders/${encodeURIComponent(id)}`, data)
}

export function deleteSalesOrder(id: string) {
  return request.delete(`/sales-orders/${encodeURIComponent(id)}`)
}

// ==================== Detail Lines ====================

export function getSalesOrderDetails(headerId: string) {
  return request.get(`/sales-orders/${encodeURIComponent(headerId)}/details`)
}

export function addSalesOrderDetail(headerId: string, data: any) {
  return request.post(`/sales-orders/${encodeURIComponent(headerId)}/details`, data)
}

// ==================== Approval (centralized) ====================

export function submitForApproval(recordId: string) {
  return request.post('/approval/submit', { module: 'sales_order', record_id: recordId })
}

export function approveOrder(recordId: string) {
  return request.post('/approval/approve', { module: 'sales_order', record_id: recordId })
}

export function withdrawOrder(recordId: string) {
  return request.post('/approval/withdraw', { module: 'sales_order', record_id: recordId })
}

export function reverseOrder(recordId: string) {
  return request.post('/approval/reverse', { module: 'sales_order', record_id: recordId })
}

export function batchSubmitForApproval(recordIds: string[]) {
  return request.post('/approval/batch-submit', { module: 'sales_order', record_ids: recordIds })
}

export function batchApproveOrders(recordIds: string[]) {
  return request.post('/approval/batch-approve', { module: 'sales_order', record_ids: recordIds })
}

// ==================== Customer (for search) ====================

export function getCustomers(params?: any) {
  return request.get('/customers', { params })
}

// ==================== Item (for search) ====================

export function getItems(params?: any) {
  return request.get('/item-masters', { params })
}

// ==================== Sales Price (for auto pricing) ====================

export function getSalesPrices(params?: any) {
  return request.get('/sales-prices', { params })
}

// 按客户+物料查询销售价目表价格（用于订单自动取价）
export function getSalesPriceForOrder(params: { customer_number: string; item_number: string }) {
  return request.get('/sales-prices/price-for-order', { params })
}

// ==================== Customer Material Mapping ====================

export function getCustomerMaterialMappings(params?: any) {
  return request.get('/customer-material-mappings', { params })
}

// 反向查询：根据客户编号+客户物料号查找产品信息
export function reverseLookupProduct(params: { customer_number: string; customer_item_number: string }) {
  return request.get('/customer-material-mappings/reverse-lookup', { params })
}

// ==================== Shipping Order ====================

export function getShippingOrders(params?: any) {
  return request.get('/shipping-orders', { params })
}

export function getShippingOrderDetail(shippingOrderNumber: string) {
  return request.get(`/shipping-orders/${encodeURIComponent(shippingOrderNumber)}`)
}

// ==================== Shipping By Order Summary (报表) ====================

export function getShippingByOrderSummary(params?: any) {
  return request.get('/sales-report/shipping-by-order-summary', { params })
}
