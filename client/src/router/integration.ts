// integration 域路由
import type { RouteRecordRaw } from 'vue-router';

const XinheyunInspectList = () => import('@/views/integration/XinheyunInspect/List.vue');
const XinheyunInspectLineList = () => import('@/views/integration/XinheyunInspect/LineList.vue');
const XinheyunInspectSummary = () => import('@/views/integration/XinheyunInspect/Summary.vue');
const XinheyunPackagingQuality = () => import('@/views/integration/XinheyunInspect/PackagingQualityReport.vue');
const XinheyunInventory = () => import('@/views/integration/XinheyunInspect/InventoryQuery.vue');
const XinheyunInventoryTransactions = () => import('@/views/integration/XinheyunInspect/InventoryTransactions.vue');
const BatchTrace = () => import('@/views/integration/BatchTrace/Index.vue');

export const integrationRoutes: RouteRecordRaw[] = [
  { path: 'xhy-inspect', name: 'XinheyunInspectList', component: XinheyunInspectList, meta: {"title":"新核云检验记录"} },
  { path: 'xhy-inspect-lines', name: 'XinheyunInspectLineList', component: XinheyunInspectLineList, meta: {"title":"检验记录明细行"} },
  { path: 'xhy-inspect-summary', name: 'XinheyunInspectSummary', component: XinheyunInspectSummary, meta: {"title":"检验报工汇总"} },
  { path: 'xhy-packaging-quality', name: 'XinheyunPackagingQuality', component: XinheyunPackagingQuality, meta: {"title":"新核云包装质量报表"} },
  { path: 'xhy-inventory', name: 'XinheyunInventory', component: XinheyunInventory, meta: {"title":"新核云库存查询"} },
  { path: 'xhy-inventory-txn', name: 'XinheyunInventoryTransactions', component: XinheyunInventoryTransactions, meta: {"title":"出入库记录"} },
  { path: 'batch-trace', name: 'BatchTrace', component: BatchTrace, meta: {"title":"批次追溯查询"} },
];
