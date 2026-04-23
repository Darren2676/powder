import request from '@/utils/request';

// 获取角色列表（分页）
export const getRoles = (params?: any) => {
  return request({
    url: '/roles',
    method: 'GET',
    params
  });
};

// 获取所有角色（不分页，下拉选择用）
export const getAllRoles = () => {
  return request({
    url: '/roles/all',
    method: 'GET'
  });
};

// 获取角色详情
export const getRoleById = (id: number) => {
  return request({
    url: `/roles/${id}`,
    method: 'GET'
  });
};

// 创建角色
export const createRole = (data: any) => {
  return request({
    url: '/roles',
    method: 'POST',
    data
  });
};

// 更新角色
export const updateRole = (id: number, data: any) => {
  return request({
    url: `/roles/${id}`,
    method: 'PUT',
    data
  });
};

// 删除角色
export const deleteRole = (id: number) => {
  return request({
    url: `/roles/${id}`,
    method: 'DELETE'
  });
};

// 分配权限给角色
export const assignPermissions = (id: number, permission_ids: number[]) => {
  return request({
    url: `/roles/${id}/permissions`,
    method: 'PUT',
    data: { permission_ids }
  });
};

// 获取权限树
export const getPermissionTree = () => {
  return request({
    url: '/permissions/tree',
    method: 'GET'
  });
};

// 获取所有权限
export const getAllPermissions = () => {
  return request({
    url: '/permissions',
    method: 'GET'
  });
};

// 创建权限
export const createPermission = (data: any) => {
  return request({
    url: '/permissions',
    method: 'POST',
    data
  });
};

// 更新权限
export const updatePermission = (id: number, data: any) => {
  return request({
    url: `/permissions/${id}`,
    method: 'PUT',
    data
  });
};

// 删除权限
export const deletePermission = (id: number) => {
  return request({
    url: `/permissions/${id}`,
    method: 'DELETE'
  });
};

// 获取当前用户权限
export const getMyPermissions = () => {
  return request({
    url: '/permissions/mine',
    method: 'GET'
  });
};

// 获取当前用户菜单树（动态侧边栏用）
export const getMyMenuTree = () => {
  return request({
    url: '/permissions/menu-tree',
    method: 'GET'
  });
};

// 批量分配用户角色
export const assignUserRoles = (userId: number, role_ids: number[]) => {
  return request({
    url: `/users/${userId}/roles`,
    method: 'PUT',
    data: { role_ids }
  });
};
