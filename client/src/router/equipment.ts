// equipment 域路由
import type { RouteRecordRaw } from 'vue-router';

const EquipmentList = () => import('@/views/equipment/Equipment/List.vue');
const MouldList = () => import('@/views/equipment/Mould/List.vue');
const MouldMaintenanceList = () => import('@/views/equipment/MouldMaintenance/List.vue');
const EquipmentDowntimeList = () => import('@/views/equipment/EquipmentDowntime/List.vue');
const EquipmentMaintenancePlanList = () => import('@/views/equipment/EquipmentMaintenancePlan/List.vue');
const EquipmentOeeDashboard = () => import('@/views/equipment/EquipmentOee/Dashboard.vue');

export const equipmentRoutes: RouteRecordRaw[] = [
  { path: 'equipments', name: 'EquipmentList', component: EquipmentList, meta: {"title":"设备台帐管理"} },
  { path: 'moulds', name: 'MouldList', component: MouldList, meta: {"title":"模具管理"} },
  { path: 'mould-maintenance', name: 'MouldMaintenanceList', component: MouldMaintenanceList, meta: {"title":"模具维修记录管理"} },
  { path: 'equipment-downtime', name: 'EquipmentDowntimeList', component: EquipmentDowntimeList, meta: {"title":"设备停机记录"} },
  { path: 'equipment-maintenance-plan', name: 'EquipmentMaintenancePlanList', component: EquipmentMaintenancePlanList, meta: {"title":"设备保养计划"} },
  { path: 'equipment-oee', name: 'EquipmentOeeDashboard', component: EquipmentOeeDashboard, meta: {"title":"OEE分析"} },
];
