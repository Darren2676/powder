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

// Token刷新状态管理
let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach(cb => cb(newToken))
  refreshSubscribers = []
}

function addRefreshSubscriber(callback: (token: string) => void) {
  refreshSubscribers.push(callback)
}

// 尝试刷新token
async function tryRefreshToken(): Promise<string | null> {
  const currentToken = localStorage.getItem('token')
  if (!currentToken) return null

  try {
    const response = await axios.post('/api/v1/auth/refresh', {}, {
      headers: { Authorization: `Bearer ${currentToken}` },
      timeout: 10000
    })
    if (response.data?.success) {
      const newToken = response.data.data.token
      const newUser = response.data.data.user
      localStorage.setItem('token', newToken)
      if (newUser) {
        localStorage.setItem('user', JSON.stringify(newUser))
      }
      return newToken
    }
    return null
  } catch {
    return null
  }
}

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

// 响应拦截器 — 错误处理 + 数据提取 + 离线拦截 + Token自动刷新
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
    const originalRequest = error.config
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
      // 排除refresh接口本身的401，避免死循环
      if (originalRequest?.url?.includes('/auth/refresh')) {
        // refresh也失败了，必须重新登录
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        if (window.location.pathname !== '/login') {
          showToast({ message: '登录已过期，请重新登录', type: 'fail' })
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }

      // 尝试刷新token
      if (!isRefreshing) {
        isRefreshing = true
        const newToken = await tryRefreshToken()
        isRefreshing = false

        if (newToken) {
          // token刷新成功，重试所有排队的请求
          onTokenRefreshed(newToken)
          // 重试当前请求
          if (originalRequest) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            return request(originalRequest)
          }
        } else {
          // token刷新失败，必须重新登录
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          if (window.location.pathname !== '/login') {
            showToast({ message: '登录已过期，请重新登录', type: 'fail' })
            window.location.href = '/login'
          }
          return Promise.reject(error)
        }
      } else {
        // 正在刷新中，排队等待
        return new Promise((resolve) => {
          addRefreshSubscriber((newToken: string) => {
            if (originalRequest) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`
              resolve(request(originalRequest))
            }
          })
        })
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
