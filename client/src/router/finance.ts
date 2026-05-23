// finance 域路由
import type { RouteRecordRaw } from 'vue-router';

const AccountingPeriodList = () => import('@/views/finance/AccountingPeriod/List.vue');
const PieceRatePriceList = () => import('@/views/finance/PieceRatePrice/List.vue');
const StandardCostList = () => import('@/views/finance/StandardCost/List.vue');

export const financeRoutes: RouteRecordRaw[] = [
  { path: 'accounting-periods', name: 'AccountingPeriodList', component: AccountingPeriodList, meta: {"title":"会计期间管理"} },
  { path: 'piece-rate-prices', name: 'PieceRatePriceList', component: PieceRatePriceList, meta: {"title":"计件单价管理"} },
  { path: 'standard-costs', name: 'StandardCostList', component: StandardCostList, meta: {"title":"标准成本单价管理"} },
];
