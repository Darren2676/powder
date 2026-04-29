import request from '@/utils/request'

export function getOrders(params?: { page?: number; limit?: number; search?: string; status?: string; approval_status?: string; production_number?: string; item_number?: string; equipment_number?: string; production_date?: string; schedule_id?: string }) {
  return request.get('/orders', { params })
}

export function createOrder(data: any) {
  return request.post('/orders', data)
}

export function updateOrder(orderNumber: string, data: any) {
  return request.put(`/orders/${encodeURIComponent(orderNumber)}`, data)
}

export function deleteOrder(orderNumber: string) {
  return request.delete(`/orders/${encodeURIComponent(orderNumber)}`)
}

export function exportOrders(search?: string) {
  return request.get('/orders/export', { params: { search }, responseType: 'blob' })
}

export function importOrders(formData: FormData) {
  return request.post('/orders/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export function importOrderFromPlan(productionNumbers: string[]) {
  return request.post('/orders/import-from-plan', { production_numbers: productionNumbers })
}

export function splitOrders(items: Array<{ type: 'original' | 'new'; production_order_number?: string; new_planned_quantity: number; source_order_number: string }>) {
  return request.post('/orders/split', { items })
}

export function dispatchOrders(items: Array<any>) {
  return request.post('/orders/dispatch', { items })
}

export function getGanttData(params?: { startDate?: string; endDate?: string; equipmentNumber?: string; search?: string }) {
  return request.get('/orders/gantt', { params })
}

export function updateGanttTask(orderNumber: string, data: { production_date?: string; planned_completion_time?: string; equipment_number?: string; schedule_id?: string }) {
  return request.put(`/orders/${encodeURIComponent(orderNumber)}/gantt-drag`, data)
}

export function getPrintData(productionOrderNumbers: string[]) {
  return request.post('/orders/print-data', { production_order_numbers: productionOrderNumbers })
}

export function dispatchAndGenerate(items: Array<any>) {
  return request.post('/orders/dispatch-and-generate', { items })
}

export function dispatchPrecheck(itemNumbers: string[]) {
  return request.post('/orders/dispatch-precheck', { item_numbers: itemNumbers })
}

