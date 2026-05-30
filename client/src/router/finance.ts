// finance 域路由
import type { RouteRecordRaw } from 'vue-router';

const AccountingPeriodList = () => import('@/views/finance/AccountingPeriod/List.vue');
const PieceRatePriceList = () => import('@/views/finance/PieceRatePrice/List.vue');
const StandardCostList = () => import('@/views/finance/StandardCost/List.vue');
const ExpenseClaimList = () => import('@/views/finance/ExpenseClaim/List.vue');
const ExpenseClaimDetail = () => import('@/views/finance/ExpenseClaim/Detail.vue');

export const financeRoutes: RouteRecordRaw[] = [
  { path: 'accounting-periods', name: 'AccountingPeriodList', component: AccountingPeriodList, meta: {"title":"会计期间管理"} },
  { path: 'piece-rate-prices', name: 'PieceRatePriceList', component: PieceRatePriceList, meta: {"title":"计件单价管理"} },
  { path: 'standard-costs', name: 'StandardCostList', component: StandardCostList, meta: {"title":"标准成本单价管理"} },
  { path: 'expense-claims', name: 'ExpenseClaimList', component: ExpenseClaimList, meta: {"title":"报销单管理"} },
  { path: 'expense-claims/:id', name: 'ExpenseClaimDetail', component: ExpenseClaimDetail, meta: {"title":"报销单详情"} },
];
