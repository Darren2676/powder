import request from '@/utils/request'

export function getProcessTasks(params?: { page?: number; limit?: number; search?: string; task_status?: string; approval_status?: string; production_order_number?: string; factory_id?: number }) {
  return request.get('/process-tasks', { params })
}

export function createProcessTask(data: any) {
  return request.post('/process-tasks', data)
}

export function updateProcessTask(taskNumber: string, data: any) {
  return request.put(`/process-tasks/${encodeURIComponent(taskNumber)}`, data)
}

export function deleteProcessTask(taskNumber: string) {
  return request.delete(`/process-tasks/${encodeURIComponent(taskNumber)}`)
}

export function batchDeleteProcessTasks(ids: string[]) {
  return request.post('/process-tasks/batch-delete', { ids })
}

export function exportProcessTasks(params?: { search?: string; factory_id?: number }) {
  return request.get('/process-tasks/export', { params, responseType: 'blob' })
}

export function importProcessTasks(formData: FormData) {
  return request.post('/process-tasks/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export function generateFromOrder(productionOrderNumbers: string[]) {
  return request.post('/process-tasks/generate-from-order', { production_order_numbers: productionOrderNumbers })
}

export function getOrdersForGenerate(params?: { page?: number; limit?: number; search?: string; factory_id?: number }) {
  return request.get('/process-tasks/orders-for-generate', { params })
}
