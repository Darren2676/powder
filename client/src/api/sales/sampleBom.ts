import request from '@/utils/request'

// ==================== 样件BOM 主表 ====================
export const getSampleBoms = (params?: any) => request.get('/sample-boms', { params })
export const getSampleBomDetail = (id: string) => request.get(`/sample-boms/${encodeURIComponent(id)}`)
export const createSampleBom = (data: any) => request.post('/sample-boms', data)
export const updateSampleBom = (id: string, data: any) => request.put(`/sample-boms/${encodeURIComponent(id)}`, data)
export const deleteSampleBom = (id: string) => request.delete(`/sample-boms/${encodeURIComponent(id)}`)
export const getSampleBomsByRequest = (requestNumber: string) => request.get(`/sample-boms/by-request/${encodeURIComponent(requestNumber)}`)

// ==================== 样件BOM 版本 ====================
export const getVersions = (bomNumber: string) => request.get(`/sample-boms/${encodeURIComponent(bomNumber)}/versions`)
export const getVersionDetail = (bomNumber: string, ver: number) => request.get(`/sample-boms/${encodeURIComponent(bomNumber)}/versions/${ver}`)
export const createVersion = (bomNumber: string, data?: any) => request.post(`/sample-boms/${encodeURIComponent(bomNumber)}/versions`, data || {})
export const copyVersion = (bomNumber: string, ver: number, data?: any) => request.post(`/sample-boms/${encodeURIComponent(bomNumber)}/versions/${ver}/copy`, data || {})
export const submitVersion = (bomNumber: string, ver: number) => request.post(`/sample-boms/${encodeURIComponent(bomNumber)}/versions/${ver}/submit`)
export const deleteVersion = (bomNumber: string, ver: number) => request.delete(`/sample-boms/${encodeURIComponent(bomNumber)}/versions/${ver}`)

// ==================== 样件BOM 版本明细 ====================
export const addVersionDetail = (bomNumber: string, ver: number, data: any) =>
  request.post(`/sample-boms/${encodeURIComponent(bomNumber)}/versions/${ver}/details`, data)
export const updateVersionDetail = (id: number, data: any) =>
  request.put(`/sample-boms/version-details/${id}`, data)
export const deleteVersionDetail = (id: number) =>
  request.delete(`/sample-boms/version-details/${id}`)
export const batchUpdateVersionDetails = (bomNumber: string, ver: number, data: { details: any[] }) =>
  request.put(`/sample-boms/${encodeURIComponent(bomNumber)}/versions/${ver}/details/batch`, data)

// ==================== 确定最终版本 & 导入 ====================
export const determineFinalVersion = (bomNumber: string, data: { final_version: number }) =>
  request.post(`/sample-boms/${encodeURIComponent(bomNumber)}/determine-version`, data)
export const importToDesignBom = (bomNumber: string, data: { version_number: number; bom_number: string }) =>
  request.post(`/sample-boms/${encodeURIComponent(bomNumber)}/import-to-design-bom`, data)

// ==================== 从设计BOM导入 ====================
export const importFromDesignBom = (data: { sample_request_number: string; design_bom_number: string; bom_name?: string }) =>
  request.post('/sample-boms/import-from-design-bom', data)
export const importDetailsFromDesignBom = (bomNumber: string, ver: number, data: { design_bom_number: string }) =>
  request.post(`/sample-boms/${encodeURIComponent(bomNumber)}/versions/${ver}/import-details-from-design-bom`, data)
export const getDesignBoms = (params?: any) => request.get('/boms', { params })

// ==================== 检测报告 ====================
export const getInspectionReports = (params?: any) => request.get('/sample-boms/inspection-reports', { params })
export const getInspectionReportDetail = (reportNumber: string) =>
  request.get(`/sample-boms/inspection-reports/${encodeURIComponent(reportNumber)}`)
export const createInspectionReport = (data: any) => request.post('/sample-boms/inspection-reports', data)
export const updateInspectionReport = (reportNumber: string, data: any) =>
  request.put(`/sample-boms/inspection-reports/${encodeURIComponent(reportNumber)}`, data)
export const submitInspectionReport = (reportNumber: string) =>
  request.post(`/sample-boms/inspection-reports/${encodeURIComponent(reportNumber)}/submit`)
export const deleteInspectionReport = (reportNumber: string) =>
  request.delete(`/sample-boms/inspection-reports/${encodeURIComponent(reportNumber)}`)
export const getReportByBomVersion = (bomNumber: string, ver: number) =>
  request.get(`/sample-boms/inspection-reports/by-bom/${encodeURIComponent(bomNumber)}/${ver}`)

// ==================== 检测报告明细 ====================
export const addReportItem = (reportNumber: string, data: any) =>
  request.post(`/sample-boms/inspection-reports/${encodeURIComponent(reportNumber)}/items`, data)
export const updateReportItem = (id: number, data: any) =>
  request.put(`/sample-boms/inspection-report-items/${id}`, data)
export const deleteReportItem = (id: number) =>
  request.delete(`/sample-boms/inspection-report-items/${id}`)
export const batchImportReportItems = (reportNumber: string) =>
  request.post(`/sample-boms/inspection-reports/${encodeURIComponent(reportNumber)}/items/batch`)
