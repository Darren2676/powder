import type { RouteRecordRaw } from 'vue-router';

const HefeiUniversity2025 = () => import('@/views/score/HefeiUniversity2025.vue');

export const scoreRoutes: RouteRecordRaw[] = [
  { path: 'hefei-university-2025', name: 'HefeiUniversity2025', component: HefeiUniversity2025, meta: { title: '合肥大学2025' } },
];
