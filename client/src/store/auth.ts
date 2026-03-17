import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User, LoginFormData, RegisterFormData, UpdateProfileFormData } from '@/types';
import * as authApi from '@/api/auth';
import { message } from 'ant-design-vue';

export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref<User | null>(null);
  const token = ref<string>(localStorage.getItem('token') || '');
  const loading = ref(false);

  // Getters
  const isLoggedIn = computed(() => !!token.value && !!user.value);
  const isAdmin = computed(() => user.value?.role === 'admin');
  const isManager = computed(() => user.value?.role === 'manager');
  const userRole = computed(() => user.value?.role);

  // Actions
  
  /**
   * 用户登录
   */
  const login = async (formData: LoginFormData) => {
    try {
      loading.value = true;
      const response: any = await authApi.login(formData);
      
      if (response.success) {
        // Save token to localStorage
        token.value = response.data.token;
        localStorage.setItem('token', response.data.token);
        
        // Save user info
        user.value = response.data.user;
        localStorage.setItem('user', JSON.stringify(response.data.user));
        
        message.success('登录成功');
        return true;
      } else {
        message.error(response.message || '登录失败');
        return false;
      }
    } catch (error: any) {
      console.error('Login error:', error);
      message.error(error.response?.data?.message || '登录失败,请重试');
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 用户注册
   */
  const register = async (formData: Omit<RegisterFormData, 'confirmPassword'>) => {
    try {
      loading.value = true;
      const response: any = await authApi.register(formData);
      
      if (response.success) {
        // Save token to localStorage
        token.value = response.data.token;
        localStorage.setItem('token', response.data.token);
        
        // Save user info
        user.value = response.data.user;
        localStorage.setItem('user', JSON.stringify(response.data.user));
        
        message.success('注册成功');
        return true;
      } else {
        message.error(response.message || '注册失败');
        return false;
      }
    } catch (error: any) {
      console.error('Register error:', error);
      message.error(error.response?.data?.message || '注册失败,请重试');
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 用户登出
   */
  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear all stored data
      token.value = '';
      user.value = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      message.success('已退出登录');
    }
  };

  /**
   * 获取当前用户信息
   */
  const fetchUser = async () => {
    try {
      loading.value = true;
      const response: any = await authApi.getMe();
      
      if (response.success) {
        user.value = response.data;
        localStorage.setItem('user', JSON.stringify(response.data));
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Fetch user error:', error);
      
      // If token is invalid, clear auth data
      if (error.response?.status === 401) {
        token.value = '';
        user.value = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
      
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 更新用户个人资料
   */
  const updateProfile = async (formData: UpdateProfileFormData) => {
    try {
      loading.value = true;
      const response: any = await authApi.updateProfile(formData);
      
      if (response.success) {
        user.value = response.data;
        localStorage.setItem('user', JSON.stringify(response.data));
        message.success('个人资料更新成功');
        return true;
      } else {
        message.error(response.message || '更新失败');
        return false;
      }
    } catch (error: any) {
      console.error('Update profile error:', error);
      message.error(error.response?.data?.message || '更新失败,请重试');
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 修改密码
   */
  const changePassword = async (oldPassword: string, newPassword: string) => {
    try {
      loading.value = true;
      const response: any = await authApi.changePassword(oldPassword, newPassword);
      
      if (response.success) {
        message.success('密码修改成功,请重新登录');
        await logout();
        return true;
      } else {
        message.error(response.message || '密码修改失败');
        return false;
      }
    } catch (error: any) {
      console.error('Change password error:', error);
      message.error(error.response?.data?.message || '密码修改失败,请重试');
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 初始化用户状态（从 localStorage 恢复）
   */
  const initAuth = () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser && token.value) {
      try {
        user.value = JSON.parse(storedUser);
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem('user');
      }
    }
  };

  // Initialize auth state
  initAuth();

  return {
    // State
    user,
    token,
    loading,
    
    // Getters
    isLoggedIn,
    isAdmin,
    isManager,
    userRole,
    
    // Actions
    login,
    register,
    logout,
    fetchUser,
    updateProfile,
    changePassword,
    initAuth
  };
});
