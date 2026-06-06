import request from '@/utils/request';
import type { ApiResponse, FactoryInfo, PaginatedData } from '@/types';

/**
 * 获取当前用户可访问的工厂列表（切换器用）
 */
export const getFactoryList = () => {
  return request<ApiResponse<FactoryInfo[]>>({
    url: '/factories/list',
    method: 'GET'
  });
};

/**
 * 切换当前工厂
 * @param factoryId 目标工厂 ID
 */
export const switchFactory = (factoryId: number) => {
  return request<ApiResponse<{ token: string; factory: FactoryInfo }>>({
    url: '/factories/switch',
    method: 'POST',
    data: { factory_id: factoryId }
  });
};

// ========== 工厂管理 CRUD ==========

/**
 * 分页获取工厂列表（管理页面）
 */
export const getFactories = (params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}) => request.get<ApiResponse<PaginatedData<FactoryInfo>>>('/factories', { params });

/**
 * 获取单个工厂详情
 */
export const getFactoryById = (id: number) =>
  request.get<ApiResponse<FactoryInfo>>(`/factories/${id}`);

/**
 * 创建工厂
 */
export const createFactory = (data: {
  factory_code: string;
  factory_name: string;
  factory_short?: string;
  address?: string;
  contact_name?: string;
  contact_phone?: string;
  is_headquarters?: boolean;
  status?: string;
}) => request.post<ApiResponse<{ id: number }>>('/factories', data);

/**
 * 更新工厂
 */
export const updateFactory = (id: number, data: {
  factory_code?: string;
  factory_name?: string;
  factory_short?: string;
  address?: string;
  contact_name?: string;
  contact_phone?: string;
  is_headquarters?: boolean;
  status?: string;
}) => request.put<ApiResponse<null>>(`/factories/${id}`, data);

/**
 * 删除工厂（软删除，改为停用）
 */
export const deleteFactory = (id: number) =>
  request.delete<ApiResponse<null>>(`/factories/${id}`);
