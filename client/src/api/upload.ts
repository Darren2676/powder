import request from '@/utils/request'
export const uploadFile = (formData: FormData) => request.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
