import axios from 'axios';
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// Create axios instance
const request: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Token刷新状态管理
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach(cb => cb(newToken));
  refreshSubscribers = [];
}

function addRefreshSubscriber(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

// 尝试刷新token
async function tryRefreshToken(): Promise<string | null> {
  const currentToken = localStorage.getItem('token');
  if (!currentToken) return null;

  try {
    const response = await axios.post('/api/v1/auth/refresh', {}, {
      headers: { Authorization: `Bearer ${currentToken}` },
      timeout: 10000
    });
    if (response.data?.success) {
      const newToken = response.data.data.token;
      const newUser = response.data.data.user;
      localStorage.setItem('token', newToken);
      if (newUser) {
        localStorage.setItem('user', JSON.stringify(newUser));
      }
      return newToken;
    }
    return null;
  } catch {
    return null;
  }
}

// Request interceptor - attach JWT token and prevent GET caching
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // 防止浏览器缓存 GET 请求
    if (config.method === 'get') {
      config.headers['Cache-Control'] = 'no-cache';
      config.headers['Pragma'] = 'no-cache';
      config.params = { ...config.params, _t: Date.now() };
    }
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors and extract data + Token auto-refresh
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
    const originalRequest = error.config;

    // 动态导入 message 避免循环依赖
    const { message } = await import('ant-design-vue');

    // Handle 401 Unauthorized - try token refresh first
    if (error.response?.status === 401) {
      // 排除refresh接口本身的401，避免死循环
      if (originalRequest?.url?.includes('/auth/refresh')) {
        // refresh也失败了，必须重新登录
        const hasToken = !!localStorage.getItem('token');
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        if (hasToken) {
          message.error('登录已过期,请重新登录');
        }

        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      // 尝试刷新token
      if (!isRefreshing) {
        isRefreshing = true;
        const newToken = await tryRefreshToken();
        isRefreshing = false;

        if (newToken) {
          // token刷新成功，重试所有排队的请求
          onTokenRefreshed(newToken);
          // 重试当前请求
          if (originalRequest) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return request(originalRequest);
          }
        } else {
          // token刷新失败，必须重新登录
          const hasToken = !!localStorage.getItem('token');
          localStorage.removeItem('token');
          localStorage.removeItem('user');

          if (hasToken) {
            message.error('登录已过期,请重新登录');
          }

          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          return Promise.reject(error);
        }
      } else {
        // 正在刷新中，排队等待
        return new Promise((resolve) => {
          addRefreshSubscriber((newToken: string) => {
            if (originalRequest) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(request(originalRequest));
            }
          });
        });
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
