// planning 域路由
import type { RouteRecordRaw } from 'vue-router';

const PlanList = () => import('@/views/planning/Plan/List.vue');
const MPSReport = () => import('@/views/planning/MPS/Report.vue');
const MRPIndex = () => import('@/views/planning/MRP/Index.vue');
const MRPHistory = () => import('@/views/planning/MRP/History.vue');

export const planningRoutes: RouteRecordRaw[] = [
  { path: 'plans', name: 'PlanList', component: PlanList, meta: {"title":"计划管理"} },
  { path: 'mps-report', name: 'MPSReport', component: MPSReport, meta: {"title":"MPS主计划"} },
  { path: 'mrp', name: 'MRPIndex', component: MRPIndex, meta: {"title":"MRP运算"} },
  { path: 'mrp-history', name: 'MRPHistory', component: MRPHistory, meta: {"title":"MRP运算历史"} },
];
