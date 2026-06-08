import request from '@/utils/request'

export const getShelfLifeReport = (params?: { page?: number; limit?: number; warehouse_number?: string; item_type?: string; expire_status?: string; search?: string; factory_id?: number }) => request.get('/shelf-life-report', { params })
