// finance 域路由
import type { RouteRecordRaw } from 'vue-router';

const AccountingPeriodList = () => import('@/views/finance/AccountingPeriod/List.vue');

export const financeRoutes: RouteRecordRaw[] = [
  { path: 'accounting-periods', name: 'AccountingPeriodList', component: AccountingPeriodList, meta: {"title":"会计期间管理"} },
];
