import request from '@/utils/request'

export const getPlasticProcessCategories = (params?: any) => request.get('/plastic-process-categories', { params })
export const createPlasticProcessCategory = (data: any) => request.post('/plastic-process-categories', data)
export const updatePlasticProcessCategory = (id: number, data: any) => request.put(`/plastic-process-categories/${id}`, data)
export const deletePlasticProcessCategory = (id: number) => request.delete(`/plastic-process-categories/${id}`)
export const exportPlasticProcessCategories = (search?: string) => request.get('/plastic-process-categories/export', { params: { search }, responseType: 'blob' })
export const importPlasticProcessCategories = (formData: FormData) => request.post('/plastic-process-categories/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const approvePlasticProcessCategory = (id: number) => request.put(`/plastic-process-categories/${id}/approve`)
export const withdrawPlasticProcessCategory = (id: number) => request.put(`/plastic-process-categories/${id}/withdraw`)
export const getAllPlasticProcessCategories = () => request.get('/plastic-process-categories/all')
