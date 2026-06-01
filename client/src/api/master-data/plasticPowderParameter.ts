import request from '@/utils/request'

export const getPlasticPowderParameters = (params?: any) => request.get('/plastic-powder-parameters', { params })
export const createPlasticPowderParameter = (data: any) => request.post('/plastic-powder-parameters', data)
export const updatePlasticPowderParameter = (id: number, data: any) => request.put(`/plastic-powder-parameters/${id}`, data)
export const deletePlasticPowderParameter = (id: number) => request.delete(`/plastic-powder-parameters/${id}`)
export const exportPlasticPowderParameters = (search?: string) => request.get('/plastic-powder-parameters/export', { params: { search }, responseType: 'blob' })
export const importPlasticPowderParameters = (formData: FormData) => request.post('/plastic-powder-parameters/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const approvePlasticPowderParameter = (id: number) => request.put(`/plastic-powder-parameters/${id}/approve`)
export const withdrawPlasticPowderParameter = (id: number) => request.put(`/plastic-powder-parameters/${id}/withdraw`)
export const getAllPlasticPowderParameters = () => request.get('/plastic-powder-parameters/all')
