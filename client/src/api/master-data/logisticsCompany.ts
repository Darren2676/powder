import request from '@/utils/request';

const BASE = '/logistics-companies';

// 列表
export function getLogisticsCompanies(params?: any) {
  return request.get(BASE, { params });
}

// 详情
export function getLogisticsCompanyDetail(companyNumber: string) {
  return request.get(`${BASE}/${companyNumber}`);
}

// 新建
export function createLogisticsCompany(data: any) {
  return request.post(BASE, data);
}

// 更新
export function updateLogisticsCompany(companyNumber: string, data: any) {
  return request.put(`${BASE}/${companyNumber}`, data);
}

// 删除
export function deleteLogisticsCompany(companyNumber: string) {
  return request.delete(`${BASE}/${companyNumber}`);
}

// 审核
export function approveLogisticsCompany(companyNumber: string) {
  return request.put(`${BASE}/${companyNumber}/approve`);
}

// 撤消审核
export function withdrawLogisticsCompany(companyNumber: string) {
  return request.put(`${BASE}/${companyNumber}/withdraw`);
}

// 启用/禁用
export function updateLogisticsCompanyCondition(companyNumber: string, condition: string) {
  return request.put(`${BASE}/${companyNumber}/condition`, { condition });
}

// 上传附件
export function uploadLogisticsCompanyAttachment(companyNumber: string, formData: FormData) {
  return request.post(`${BASE}/${companyNumber}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}

// 下载附件
export function downloadLogisticsCompanyAttachment(attachmentId: number) {
  return request.get(`${BASE}/attachment/${attachmentId}/download`, { responseType: 'blob' });
}

// 删除附件
export function removeLogisticsCompanyAttachment(attachmentId: number) {
  return request.delete(`${BASE}/attachment/${attachmentId}`);
}

// 导出
export function exportLogisticsCompanies(params?: any) {
  return request.get(`${BASE}/export`, { params, responseType: 'blob' });
}

// 导入
export function importLogisticsCompanies(formData: FormData) {
  return request.post(`${BASE}/import`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}
