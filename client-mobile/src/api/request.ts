import axios from 'axios'
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { showToast } from 'vant'
import { enqueueRequest, setCachedData, getCachedData } from '@/utils/offlineDB'
import { shouldEnqueueOffline } from '@/utils/offlineSync'

const request: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器 — 附加JWT Token
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    console.error('Request error:', error)
    return Promise.reject(error)
  }
)

// 响应拦截器 — 错误处理 + 数据提取 + 离线拦截
request.interceptors.response.use(
  (response: AxiosResponse) => {
    // blob 响应返回完整 response，以便 res.data 获取 blob
    if (response.config.responseType === 'blob') {
      return response
    }
    // 缓存成功的 GET 响应（用于离线回显）
    if (response.config.method === 'get' && response.data?.success) {
      const cacheKey = `api:${response.config.url}`
      setCachedData(cacheKey, response.data, 5 * 60 * 1000).catch(() => {})
    }
    return response.data
  },
  async (error) => {
    const isNetworkError = error.message === 'Network Error' || !navigator.onLine
    const method = error.config?.method?.toUpperCase() || ''
    const url = error.config?.url || ''

    // 离线写操作 → 入队
    if (isNetworkError && shouldEnqueueOffline(method, url)) {
      const body = error.config?.data ? JSON.stringify(JSON.parse(error.config.data)) : ''
      await enqueueRequest({
        method: method as 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url,
        body,
        description: `${method} ${url}`,
      })
      showToast({ message: '网络不可用，操作已保存，恢复网络后自动同步', type: 'fail', duration: 3000 })
      // 返回一个模拟的成功响应，避免 UI 报错
      return { success: true, data: null, message: '离线模式：操作已入队', offline: true }
    }

    // 离线读操作 → 尝试返回缓存
    if (isNetworkError && method === 'GET') {
      const cacheKey = `api:${url}`
      const cached = await getCachedData(cacheKey)
      if (cached) {
        return cached
      }
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      showToast({ message: '登录已过期，请重新登录', type: 'fail' })
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    } else if (error.response?.status === 403) {
      showToast({ message: '没有权限执行此操作', type: 'fail' })
    } else if (error.response?.status === 404) {
      showToast({ message: '请求的资源不存在', type: 'fail' })
    } else if (error.response?.status === 500) {
      showToast({ message: '服务器错误，请稍后重试', type: 'fail' })
    } else if (isNetworkError) {
      showToast({ message: '网络连接失败', type: 'fail' })
    } else if (error.code === 'ECONNABORTED') {
      showToast({ message: '请求超时，请稍后重试', type: 'fail' })
    } else {
      const msg = error.response?.data?.message || '操作失败'
      showToast({ message: msg, type: 'fail' })
    }
    return Promise.reject(error)
  }
)

export default request
