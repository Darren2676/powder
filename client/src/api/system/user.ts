import request from '@/utils/request';
import type { ApiResponse, PaginatedData, User, UserQueryParams } from '@/types';

/**
 * 获取用户列表
 */
export const getUsers = (params?: UserQueryParams) => {
  return request<ApiResponse<PaginatedData<User>>>({
    url: '/users',
    method: 'GET',
    params
  });
};

/**
 * 创建用户
 */
export const createUser = (data: {
  username: string;
  password: string;
  email?: string;
  real_name?: string;
  role?: string;
  department?: string;
  phone?: string;
  status?: string;
}) => {
  return request<ApiResponse<User>>({
    url: '/users',
    method: 'POST',
    data
  });
};

/**
 * 根据ID获取用户详情
 */
export const getUserById = (id: number) => {
  return request<ApiResponse<User>>({
    url: `/users/${id}`,
    method: 'GET'
  });
};

/**
 * 更新用户信息
 */
export const updateUser = (id: number, data: Partial<User>) => {
  return request<ApiResponse<User>>({
    url: `/users/${id}`,
    method: 'PUT',
    data
  });
};

/**
 * 更新用户角色
 */
export const updateUserRole = (id: number, role: string) => {
  return request<ApiResponse<User>>({
    url: `/users/${id}/role`,
    method: 'PUT',
    data: { role }
  });
};

/**
 * 更新用户状态
 */
export const updateUserStatus = (id: number, status: string) => {
  return request<ApiResponse<User>>({
    url: `/users/${id}/status`,
    method: 'PUT',
    data: { status }
  });
};

/**
 * 删除用户
 */
export const deleteUser = (id: number) => {
  return request<ApiResponse<void>>({
    url: `/users/${id}`,
    method: 'DELETE'
  });
};

/**
 * 获取可分配的用户列表（活跃的员工和经理）
 */
export const getAssignableUsers = () => {
  return request<ApiResponse<User[]>>({
    url: '/users/assignable',
    method: 'GET'
  });
};
