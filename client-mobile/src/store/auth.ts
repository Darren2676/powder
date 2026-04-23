import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '@/api/auth'
import { showToast } from 'vant'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<any>(null)
  const token = ref<string>(localStorage.getItem('token') || '')
  const loading = ref(false)

  const isLoggedIn = computed(() => !!token.value && !!user.value)

  const login = async (username: string, password: string) => {
    try {
      loading.value = true
      const response: any = await authApi.login({ username, password })
      if (response.success) {
        token.value = response.data.token
        localStorage.setItem('token', response.data.token)
        user.value = response.data.user
        localStorage.setItem('user', JSON.stringify(response.data.user))
        showToast({ message: '登录成功', type: 'success' })
        return true
      } else {
        showToast({ message: response.message || '登录失败', type: 'fail' })
        return false
      }
    } catch (error: any) {
      console.error('Login error:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch (e) {
      // ignore
    } finally {
      token.value = ''
      user.value = null
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
  }

  const fetchUser = async () => {
    try {
      loading.value = true
      const response: any = await authApi.getMe()
      if (response.success) {
        user.value = response.data
        localStorage.setItem('user', JSON.stringify(response.data))
        return true
      }
      return false
    } catch (error: any) {
      if (error.response?.status === 401) {
        token.value = ''
        user.value = null
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
      return false
    } finally {
      loading.value = false
    }
  }

  // 初始化：从localStorage恢复
  const initAuth = () => {
    const storedUser = localStorage.getItem('user')
    if (storedUser && token.value) {
      try {
        user.value = JSON.parse(storedUser)
      } catch {
        localStorage.removeItem('user')
      }
    }
  }

  initAuth()

  return { user, token, loading, isLoggedIn, login, logout, fetchUser, initAuth }
})
