import request from '@/utils/request';

// 获取API密钥列表
export const getApiKeys = () => {
  return request({
    url: '/api-keys',
    method: 'GET'
  });
};

// 创建API密钥
export const createApiKey = (data: any) => {
  return request({
    url: '/api-keys',
    method: 'POST',
    data
  });
};

// 更新API密钥
export const updateApiKey = (id: number, data: any) => {
  return request({
    url: `/api-keys/${id}`,
    method: 'PUT',
    data
  });
};

// 删除API密钥
export const deleteApiKey = (id: number) => {
  return request({
    url: `/api-keys/${id}`,
    method: 'DELETE'
  });
};

// 重新生成密钥
export const regenerateApiKey = (id: number) => {
  return request({
    url: `/api-keys/${id}/regenerate`,
    method: 'POST'
  });
};

// 获取调用日志
export const getApiKeyUsage = (id: number, params?: any) => {
  return request({
    url: `/api-keys/${id}/usage`,
    method: 'GET',
    params
  });
};

// 获取调用统计
export const getApiKeyStats = (id: number) => {
  return request({
    url: `/api-keys/${id}/stats`,
    method: 'GET'
  });
};
