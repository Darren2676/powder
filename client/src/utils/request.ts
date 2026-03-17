import axios from 'axios';
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// Create axios instance
const request: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - attach JWT token
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors and extract data
request.interceptors.response.use(
  (response: AxiosResponse) => {
    // blob 响应返回完整 response，以便 res.data 获取 blob
    if (response.config.responseType === 'blob') {
      return response;
    }
    // Extract data from response
    return response.data;
  },
  async (error) => {
    // 动态导入 message 避免循环依赖
    const { message } = await import('ant-design-vue');
    
    // Handle 401 Unauthorized - clear token and redirect to login
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      message.error('登录已过期,请重新登录');
      
      // Redirect to login page
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } 
    // Handle 403 Forbidden
    else if (error.response?.status === 403) {
      message.error('没有权限执行此操作');
    }
    // Handle 404 Not Found
    else if (error.response?.status === 404) {
      message.error('请求的资源不存在');
    }
    // Handle 500 Server Error
    else if (error.response?.status === 500) {
      message.error('服务器错误,请稍后重试');
    }
    // Handle network errors
    else if (error.message === 'Network Error') {
      message.error('网络连接失败,请检查网络');
    }
    // Handle timeout
    else if (error.code === 'ECONNABORTED') {
      message.error('请求超时,请稍后重试');
    }
    // Other errors - show message from response if available
    else {
      const errorMessage = error.response?.data?.message || '操作失败,请重试';
      message.error(errorMessage);
    }

    return Promise.reject(error);
  }
);

export default request;
