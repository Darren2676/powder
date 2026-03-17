import request from '@/utils/request'

export function getItems(params?: { page?: number; limit?: number; search?: string; item_type?: string }) {
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
