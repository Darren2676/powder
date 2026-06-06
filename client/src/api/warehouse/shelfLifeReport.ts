import request from '@/utils/request'

export const getShelfLifeReport = (params?: any) => request.get('/shelf-life-report', { params })
