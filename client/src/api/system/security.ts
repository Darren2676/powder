import request from '@/utils/request';
import type { ApiResponse } from '@/types';

export interface SecuritySetting {
  id: number;
  setting_key: string;
  setting_value: string;
  description: string;
  updated_at: string;
}

export interface PasswordPolicy {
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_lowercase: boolean;
  password_require_number: boolean;
  password_require_special: boolean;
}

export interface LoginLog {
  id: number;
  user_id: number | null;
  username: string;
  login_time: string;
  ip_address: string;
  user_agent: string;
  status: 'success' | 'failed';
  fail_reason: string;
}

export const getSecuritySettings = () => {
  return request<ApiResponse<SecuritySetting[]>>({
    url: '/security/settings',
    method: 'GET'
  });
};

export const updateSecuritySettings = (settings: { setting_key: string; setting_value: string }[]) => {
  return request<ApiResponse<void>>({
    url: '/security/settings',
    method: 'PUT',
    data: { settings }
  });
};

export const getPasswordPolicy = () => {
  return request<ApiResponse<PasswordPolicy>>({
    url: '/security/password-policy',
    method: 'GET'
  });
};

export const getLoginLogs = (params?: {
  page?: number;
  limit?: number;
  username?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
}) => {
  return request<ApiResponse<any>>({
    url: '/security/login-logs',
    method: 'GET',
    params
  });
};

export const resetUserPassword = (userId: number, new_password: string) => {
  return request<ApiResponse<void>>({
    url: `/security/users/${userId}/reset-password`,
    method: 'PUT',
    data: { new_password }
  });
};

export const unlockUser = (userId: number) => {
  return request<ApiResponse<void>>({
    url: `/security/users/${userId}/unlock`,
    method: 'PUT'
  });
};
