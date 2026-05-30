import request from '@/utils/request';

// 列表
export const getSampleRequests = (params: any) => request.get('/sample-requests', { params });

// 详情
export const getSampleRequestDetail = (id: string) => request.get(`/sample-requests/${encodeURIComponent(id)}`);

// 新建
export const createSampleRequest = (data: any) => request.post('/sample-requests', data);

// 编辑
export const updateSampleRequest = (id: string, data: any) => request.put(`/sample-requests/${encodeURIComponent(id)}`, data);

// 删除
export const deleteSampleRequest = (id: string) => request.delete(`/sample-requests/${encodeURIComponent(id)}`);

// 提交
export const submitSampleRequest = (id: string) => request.post(`/sample-requests/${encodeURIComponent(id)}/submit`);

// 撤回
export const withdrawSampleRequest = (id: string) => request.post(`/sample-requests/${encodeURIComponent(id)}/withdraw`);

// 接收
export const receiveSampleRequest = (id: string) => request.post(`/sample-requests/${encodeURIComponent(id)}/receive`);

// 完成
export const completeSampleRequest = (id: string, data: any) => request.post(`/sample-requests/${encodeURIComponent(id)}/complete`, data);

// 保存实验室数据（中途保存）
export const updateLabData = (id: string, data: any) => request.put(`/sample-requests/${encodeURIComponent(id)}/lab`, data);
