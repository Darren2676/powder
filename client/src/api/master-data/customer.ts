import request from '@/utils/request'

export const getCustomers = (params?: any) => request.get('/customers', { params })
export const getCustomerDetail = (customerId: string) => request.get(`/customers/${encodeURIComponent(customerId)}`)
export const createCustomer = (data: any) => request.post('/customers', data)
export const updateCustomer = (customerId: string, data: any) => request.put(`/customers/${encodeURIComponent(customerId)}`, data)
export const updateCustomerCondition = (customerId: string, data: any) => request.put(`/customers/${encodeURIComponent(customerId)}/condition`, data)
export const deleteCustomer = (customerId: string) => request.delete(`/customers/${encodeURIComponent(customerId)}`)
export const approveCustomer = (customerId: string) => request.put(`/customers/${encodeURIComponent(customerId)}/approve`)
export const withdrawCustomer = (customerId: string) => request.put(`/customers/${encodeURIComponent(customerId)}/withdraw`)
export const exportCustomers = (format: string = 'xlsx') => request.get('/customers/export', { params: { format }, responseType: 'blob' })
export const importCustomers = (formData: FormData) => request.post('/customers/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// 地址
export const addCustomerAddress = (customerId: string, data: any) => request.post(`/customers/${encodeURIComponent(customerId)}/addresses`, data)
export const updateCustomerAddress = (addressId: number, data: any) => request.put(`/customers/address/${addressId}`, data)
export const removeCustomerAddress = (addressId: number) => request.delete(`/customers/address/${addressId}`)

// 附件
export const uploadCustomerAttachment = (customerId: string, formData: FormData) => request.post(`/customers/${encodeURIComponent(customerId)}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const downloadCustomerAttachment = (attachmentId: number) => request.get(`/customers/attachment/${attachmentId}/download`, { responseType: 'blob' })
export const removeCustomerAttachment = (attachmentId: number) => request.delete(`/customers/attachment/${attachmentId}`)
