import request from '@/utils/request'

export function getCustomers(params?: { page?: number; limit?: number; search?: string }) {
  return request.get('/customers', { params })
}

export function createCustomer(data: any) {
  return request.post('/customers', data)
}

export function updateCustomer(customerId: string, data: any) {
  return request.put(`/customers/${encodeURIComponent(customerId)}`, data)
}

export function deleteCustomer(customerId: string) {
  return request.delete(`/customers/${encodeURIComponent(customerId)}`)
}

export function exportCustomers() {
  return request.get('/customers/export', { responseType: 'blob' })
}

export function importCustomers(formData: FormData) {
  return request.post('/customers/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
