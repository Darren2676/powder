import request from '@/utils/request'

// 查询工艺参数列表
export const getProcessParameters = (params?: any) =>
  request({ url: '/process-parameters', method: 'GET', params })

// 获取工艺参数详情（主表+明细）
export const getProcessParameterDetail = (id: string | number) =>
  request({ url: `/process-parameters/${id}`, method: 'GET' })

// 创建工艺参数
export const createProcessParameter = (data: any) =>
  request({ url: '/process-parameters', method: 'POST', data })

// 更新工艺参数（草稿状态）
export const updateProcessParameter = (id: string | number, data: any) =>
  request({ url: `/process-parameters/${id}`, method: 'PUT', data })

// 删除工艺参数（草稿状态）
export const deleteProcessParameter = (id: string | number) =>
  request({ url: `/process-parameters/${id}`, method: 'DELETE' })

// 按产品查询生效参数
export const getParametersByItem = (itemNumber: string) =>
  request({ url: `/process-parameters/by-item/${encodeURIComponent(itemNumber)}`, method: 'GET' })

// 按产品+工艺路线查询生效参数
export const getParametersByRoute = (itemNumber: string, routeNumber: string) =>
  request({ url: `/process-parameters/by-route/${encodeURIComponent(itemNumber)}/${encodeURIComponent(routeNumber)}`, method: 'GET' })

// 导出
export const exportProcessParameters = (search?: string) =>
  request({ url: '/process-parameters/export', method: 'GET', params: { search }, responseType: 'blob' })

// 下载导入模板
export const downloadImportTemplate = () =>
  request({ url: '/process-parameters/import-template', method: 'GET', responseType: 'blob' })

// 导入
export const importProcessParameters = (formData: FormData) =>
  request({ url: '/process-parameters/import', method: 'POST', data: formData, headers: { 'Content-Type': 'multipart/form-data' } })
