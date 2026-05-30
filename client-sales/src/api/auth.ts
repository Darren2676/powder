import request from './request'

export const login = (data: { username: string; password: string }) => {
  return request.post('/auth/login', data)
}

export const getMe = () => {
  return request.get('/auth/me')
}

export const logout = () => {
  return request.post('/auth/logout')
}
