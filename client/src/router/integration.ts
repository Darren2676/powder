// integration 域路由
import type { RouteRecordRaw } from 'vue-router';

const BatchTrace = () => import('@/views/integration/BatchTrace/Index.vue');

export const integrationRoutes: RouteRecordRaw[] = [
  { path: 'batch-trace', name: 'BatchTrace', component: BatchTrace, meta: {"title":"批次追溯查询"} },
];
