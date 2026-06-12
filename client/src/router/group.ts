import type { RouteRecordRaw } from 'vue-router';

const HQCockpit = () => import('@/views/group/HQCockpit.vue');
const SalesSummary = () => import('@/views/group/SalesSummary.vue');
const ProductionSummary = () => import('@/views/group/ProductionSummary.vue');
const PurchaseSummary = () => import('@/views/group/PurchaseSummary.vue');
const InventorySummary = () => import('@/views/group/InventorySummary.vue');
const FinanceSummary = () => import('@/views/group/FinanceSummary.vue');
const QualitySummary = () => import('@/views/group/QualitySummary.vue');
const InventoryFlow = () => import('@/views/group/InventoryFlow.vue');

export const groupRoutes: RouteRecordRaw[] = [
  { path: 'hq-cockpit', name: 'HQCockpit', component: HQCockpit, meta: { title: '集团管理驾驶舱', permissionCode: 'hq-cockpit' } },
  { path: 'hq-sales-summary', name: 'HQSalesSummary', component: SalesSummary, meta: { title: '集团销售汇总表', permissionCode: 'hq-sales-summary' } },
  { path: 'hq-production-summary', name: 'HQProductionSummary', component: ProductionSummary, meta: { title: '集团生产汇总表', permissionCode: 'hq-production-summary' } },
  { path: 'hq-purchase-summary', name: 'HQPurchaseSummary', component: PurchaseSummary, meta: { title: '集团采购汇总表', permissionCode: 'hq-purchase-summary' } },
  { path: 'hq-inventory-summary', name: 'HQInventorySummary', component: InventorySummary, meta: { title: '集团库存汇总表', permissionCode: 'hq-inventory-summary' } },
  { path: 'hq-finance-summary', name: 'HQFinanceSummary', component: FinanceSummary, meta: { title: '集团财务汇总表', permissionCode: 'hq-finance-summary' } },
  { path: 'hq-quality-summary', name: 'HQQualitySummary', component: QualitySummary, meta: { title: '集团质量汇总表', permissionCode: 'hq-quality-summary' } },
  { path: 'hq-inventory-flow', name: 'HQInventoryFlow', component: InventoryFlow, meta: { title: '集团出入库流水总表', permissionCode: 'hq-inventory-flow' } },
];
