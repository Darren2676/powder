import request from '@/utils/request'

// ==================== 生产单进度看板 ====================

export function getKanbanOrders(params?: { page?: number; limit?: number; search?: string; plan_status?: string; item_properties?: string; factory_id?: number }) {
  return request.get('/process-kanban/orders', { params })
}

export function getKanbanOrderFlow(orderNo: string) {
  return request.get(`/process-kanban/order/${encodeURIComponent(orderNo)}/flow`)
}
