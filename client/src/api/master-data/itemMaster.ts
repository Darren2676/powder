import request from '@/utils/request'

export function getItems(params?: { page?: number; limit?: number; search?: string; item_type?: string; item_properties?: string; business_scope?: string }) {
  return request.get('/item-masters', { params })
}

export function getItemDetail(itemNumber: string) {
  return request.get(`/item-masters/${itemNumber}`)
}

export function createItem(data: any) {
  return request.post('/item-masters', data)
}

export function updateItem(itemNumber: string, data: any) {
  return request.put(`/item-masters/${itemNumber}`, data)
}

export function deleteItem(itemNumber: string) {
  return request.delete(`/item-masters/${itemNumber}`)
}

export function exportItems(params?: { search?: string; item_type?: string }) {
  return request.get('/item-masters/export', {
    params,
    responseType: 'blob'
  })
}

export function importItems(formData: FormData, itemType: string) {
  return request.post(`/item-masters/import?item_type=${encodeURIComponent(itemType)}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

// ==================== 附件管理 ====================
export function getItemAttachments(itemNumber: string, category?: string) {
  const params: any = {}
  if (category) params.category = category
  return request.get(`/item-masters/${encodeURIComponent(itemNumber)}/attachments`, { params })
}

export function uploadItemAttachment(itemNumber: string, formData: FormData) {
  return request.post(`/item-masters/${encodeURIComponent(itemNumber)}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export function downloadItemAttachment(itemNumber: string, id: number) {
  return request.get(`/item-masters/${encodeURIComponent(itemNumber)}/attachments/${id}/download`, {
    responseType: 'blob'
  })
}

export function deleteItemAttachment(itemNumber: string, id: number) {
  return request.delete(`/item-masters/${encodeURIComponent(itemNumber)}/attachments/${id}`)
}

export function approveItem(itemNumber: string) {
  return request.put(`/item-masters/${encodeURIComponent(itemNumber)}/approve`)
}

export function withdrawItem(itemNumber: string) {
  return request.put(`/item-masters/${encodeURIComponent(itemNumber)}/withdraw`)
}
