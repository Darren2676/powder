import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import { showToast } from 'vant'

const request: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
})

// 请求拦截器
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器
request.interceptors.response.use(
  (response: AxiosResponse) => {
    if (response.config.responseType === 'blob') return response
    return response.data as any
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (window.location.pathname !== '/login') {
        showToast({ message: '登录已过期，请重新登录', type: 'fail' })
        window.location.href = '/login'
      }
    } else if (error.response?.status === 403) {
      showToast({ message: '没有权限执行此操作', type: 'fail' })
    } else if (error.response?.status === 500) {
      showToast({ message: '服务器错误，请稍后重试', type: 'fail' })
    } else if (error.message === 'Network Error') {
      showToast({ message: '网络连接失败', type: 'fail' })
    } else {
      const msg = error.response?.data?.message || '操作失败'
      showToast({ message: msg, type: 'fail' })
    }
    return Promise.reject(error)
  }
)

export default request
