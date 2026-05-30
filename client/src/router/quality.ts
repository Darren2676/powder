// quality 域路由
import type { RouteRecordRaw } from 'vue-router';

const DefectReasonList = () => import('@/views/quality/DefectReason/List.vue');
const DefectClassList = () => import('@/views/quality/DefectClass/List.vue');
const DefectList = () => import('@/views/quality/Defect/List.vue');
const QualityCharacteristicList = () => import('@/views/quality/QualityCharacteristic/List.vue');
const InspectionSpecProductionList = () => import('@/views/quality/InspectionSpec/List.vue');
const InspectionSpecIncomingList = () => import('@/views/quality/InspectionSpec/List.vue');
const InspectionPlanList = () => import('@/views/quality/InspectionPlan/List.vue');
const IncomingInspectPlanList = () => import('@/views/quality/IncomingInspectPlan/List.vue');
const QualityReport = () => import('@/views/quality/QualityReport/Index.vue');
const ProductQualitySummary = () => import('@/views/quality/QualityReport/ProductSummary.vue');
const PurchaseInspection = () => import('@/views/quality/QualityReport/PurchaseInspection.vue');
const ProductionInspectionList = () => import('@/views/quality/ProductionInspection/List.vue');
const NonconformingProductList = () => import('@/views/quality/NonconformingProduct/List.vue');
const PendingNonconformingProductList = () => import('@/views/quality/NonconformingProduct/PendingList.vue');
const ReworkOrderList = () => import('@/views/quality/ReworkOrder/List.vue');
const ScrapOrderReport = () => import('@/views/quality/ScrapOrderReport/Index.vue');
const ScrapInventoryReport = () => import('@/views/quality/ScrapInventoryReport/Index.vue');
const ScrapDisposalReport = () => import('@/views/quality/ScrapDisposalReport/Index.vue');
const ScrapQualityStatsReport = () => import('@/views/quality/ScrapQualityStatsReport/Index.vue');

export const qualityRoutes: RouteRecordRaw[] = [
  { path: 'defect-reasons', name: 'DefectReasonList', component: DefectReasonList, meta: {"title":"缺陷原因管理"} },
  { path: 'defect-classes', name: 'DefectClassList', component: DefectClassList, meta: {"title":"缺陷分类管理"} },
  { path: 'defects', name: 'DefectList', component: DefectList, meta: {"title":"缺陷管理"} },
  { path: 'quality-characteristics', name: 'QualityCharacteristicList', component: QualityCharacteristicList, meta: {"title":"质量特性管理"} },
  { path: 'inspection-specs-production', name: 'InspectionSpecProductionList', component: InspectionSpecProductionList, meta: { title: '生产检验规范', specType: '生产' } },
  { path: 'inspection-specs-incoming', name: 'InspectionSpecIncomingList', component: InspectionSpecIncomingList, meta: { title: '来料检验规范', specType: '来料' } },
  { path: 'inspection-plans', name: 'InspectionPlanList', component: InspectionPlanList, meta: {"title":"生产检验方案"} },
  { path: 'incoming-inspect-plans', name: 'IncomingInspectPlanList', component: IncomingInspectPlanList, meta: {"title":"收料检验方案"} },
  { path: 'quality-report', name: 'QualityReport', component: QualityReport, meta: {"title":"生产单质量报表"} },
  { path: 'product-quality-summary', name: 'ProductQualitySummary', component: ProductQualitySummary, meta: {"title":"按产品质量汇总"} },
  { path: 'purchase-inspection', name: 'PurchaseInspection', component: PurchaseInspection, meta: {"title":"采购质量检验"} },
  { path: 'production-inspections', name: 'ProductionInspectionList', component: ProductionInspectionList, meta: {"title":"生产检验管理"} },
  { path: 'nonconforming-products', name: 'NonconformingProductList', component: NonconformingProductList, meta: {"title":"不合格处理单"} },
  { path: 'pending-nonconforming-products', name: 'PendingNonconformingProductList', component: PendingNonconformingProductList, meta: {"title":"待处理不合格品"} },
  { path: 'rework-orders', name: 'ReworkOrderList', component: ReworkOrderList, meta: {"title":"返修单管理"} },
  { path: 'scrap-order-report', name: 'ScrapOrderReport', component: ScrapOrderReport, meta: {"title":"报废单管理报表"} },
  { path: 'scrap-inventory-report', name: 'ScrapInventoryReport', component: ScrapInventoryReport, meta: {"title":"报废仓库存报表"} },
  { path: 'scrap-disposal-report', name: 'ScrapDisposalReport', component: ScrapDisposalReport, meta: {"title":"报废处置报表"} },
  { path: 'scrap-quality-stats-report', name: 'ScrapQualityStatsReport', component: ScrapQualityStatsReport, meta: {"title":"废品统计分析报表"} },
];
