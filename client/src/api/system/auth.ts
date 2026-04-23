import request from '@/utils/request';
import type { 
  ApiResponse, 
  User, 
  LoginFormData, 
  RegisterFormData, 
  UpdateProfileFormData 
} from '@/types';

/**
 * 用户登录
 */
export const login = (data: LoginFormData) => {
  return request<ApiResponse<{ user: User; token: string }>>({
    url: '/auth/login',
    method: 'POST',
    data
  });
};

/**
 * 用户注册
 */
export const register = (data: Omit<RegisterFormData, 'confirmPassword'>) => {
  return request<ApiResponse<{ user: User; token: string }>>({
    url: '/auth/register',
    method: 'POST',
    data
  });
};

/**
 * 获取当前用户信息
 */
export const getMe = () => {
  return request<ApiResponse<User>>({
    url: '/auth/me',
    method: 'GET'
  });
};

/**
 * 更新用户个人资料
 */
export const updateProfile = (data: UpdateProfileFormData) => {
  return request<ApiResponse<User>>({
    url: '/auth/profile',
    method: 'PUT',
    data
  });
};

/**
 * 修改密码
 */
export const changePassword = (oldPassword: string, newPassword: string) => {
  return request<ApiResponse<void>>({
    url: '/auth/password',
    method: 'PUT',
    data: {
      oldPassword,
      newPassword
    }
  });
};

/**
 * 用户登出
 */
export const logout = () => {
  return request<ApiResponse<void>>({
    url: '/auth/logout',
    method: 'POST'
  });
};
