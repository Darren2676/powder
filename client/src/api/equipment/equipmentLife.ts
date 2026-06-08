import request from '@/utils/request'

// 设备状态概览
export function getEquipmentStatusOverview() {
  return request.get('/equipments/status-overview')
}

// 更新设备状态
export function updateEquipmentStatus(id: string, data: { equipment_status: string; fault_reason?: string }) {
  return request.put(`/equipments/${encodeURIComponent(id)}/status`, data)
}

// 更新设备保养设置
export function updateEquipmentMaintenanceSettings(id: string, data: { maintenance_cycle_days?: number; daily_running_hours?: number }) {
  return request.put(`/equipments/${encodeURIComponent(id)}/maintenance-settings`, data)
}

// 停机记录
export function getEquipmentDowntimes(params?: { page?: number; limit?: number; equipment_number?: string; downtime_type?: string; date_from?: string; date_to?: string; search?: string; factory_id?: number }) {
  return request.get('/equipment-downtime', { params })
}

export function createEquipmentDowntime(data: any) {
  return request.post('/equipment-downtime', data)
}

export function updateEquipmentDowntime(id: number, data: any) {
  return request.put(`/equipment-downtime/${id}`, data)
}

export function deleteEquipmentDowntime(id: number) {
  return request.delete(`/equipment-downtime/${id}`)
}

export function exportEquipmentDowntimes(params?: { equipment_number?: string; downtime_type?: string; factory_id?: number }) {
  return request.get('/equipment-downtime/export', { params, responseType: 'blob' })
}

export function approveEquipmentDowntime(id: number) {
  return request.put(`/equipment-downtime/${id}/approve`)
}

export function withdrawEquipmentDowntime(id: number) {
  return request.put(`/equipment-downtime/${id}/withdraw`)
}

// 保养计划
export function getEquipmentMaintenancePlans(params?: { page?: number; limit?: number; equipment_number?: string; plan_status?: string; maintenance_type?: string; date_from?: string; date_to?: string; factory_id?: number }) {
  return request.get('/equipment-maintenance-plan', { params })
}

export function createEquipmentMaintenancePlan(data: any) {
  return request.post('/equipment-maintenance-plan', data)
}

export function updateEquipmentMaintenancePlan(id: number, data: any) {
  return request.put(`/equipment-maintenance-plan/${id}`, data)
}

export function deleteEquipmentMaintenancePlan(id: number) {
  return request.delete(`/equipment-maintenance-plan/${id}`)
}

export function executeMaintenancePlan(id: number) {
  return request.put(`/equipment-maintenance-plan/${id}/execute`)
}

export function completeMaintenancePlan(id: number, data?: { actual_date?: string; completion_remark?: string }) {
  return request.put(`/equipment-maintenance-plan/${id}/complete`, data)
}

export function cancelMaintenancePlan(id: number) {
  return request.put(`/equipment-maintenance-plan/${id}/cancel`)
}

export function autoGenerateMaintenancePlans() {
  return request.post('/equipment-maintenance-plan/auto-generate')
}

export function exportEquipmentMaintenancePlans(params?: { equipment_number?: string; plan_status?: string; factory_id?: number }) {
  return request.get('/equipment-maintenance-plan/export', { params, responseType: 'blob' })
}

export function approveEquipmentMaintenancePlan(id: number) {
  return request.put(`/equipment-maintenance-plan/${id}/approve`)
}

export function withdrawEquipmentMaintenancePlan(id: number) {
  return request.put(`/equipment-maintenance-plan/${id}/withdraw`)
}

// OEE
export function getEquipmentOees(params?: { page?: number; limit?: number; equipment_number?: string; date_from?: string; date_to?: string; factory_id?: number }) {
  return request.get('/equipment-oee', { params })
}

export function saveEquipmentOee(data: any) {
  return request.post('/equipment-oee', data)
}

export function deleteEquipmentOee(id: number) {
  return request.delete(`/equipment-oee/${id}`)
}

export function getOeeDashboard(params?: { date_from?: string; date_to?: string; equipment_number?: string; factory_id?: number }) {
  return request.get('/equipment-oee/dashboard', { params })
}

export function calculateOeeFromProduction(data: { date: string; equipment_number?: string }) {
  return request.post('/equipment-oee/calculate', data)
}
