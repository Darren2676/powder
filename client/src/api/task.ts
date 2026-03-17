import request from '@/utils/request'

export function getTasks(params?: { page?: number; limit?: number; search?: string; status?: string }) {
  return request.get('/tasks', { params })
}

export function createTask(data: any) {
  return request.post('/tasks', data)
}

export function updateTask(taskNumber: string, data: any) {
  return request.put(`/tasks/${encodeURIComponent(taskNumber)}`, data)
}

export function deleteTask(taskNumber: string) {
  return request.delete(`/tasks/${encodeURIComponent(taskNumber)}`)
}

export function exportTasks(search?: string) {
  return request.get('/tasks/export', { params: { search }, responseType: 'blob' })
}

export function importTasks(formData: FormData) {
  return request.post('/tasks/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export function importFromPlan(productionNumbers: string[]) {
  return request.post('/tasks/import-from-plan', { production_numbers: productionNumbers })
}
