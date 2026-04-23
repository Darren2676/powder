// quality 域路由
import type { RouteRecordRaw } from 'vue-router';

const DefectReasonList = () => import('@/views/quality/DefectReason/List.vue');
const DefectClassList = () => import('@/views/quality/DefectClass/List.vue');
const DefectList = () => import('@/views/quality/Defect/List.vue');
const QualityCharacteristicList = () => import('@/views/quality/QualityCharacteristic/List.vue');
const InspectionSpecProductionList = () => import('@/views/quality/InspectionSpec/List.vue');
const InspectionSpecIncomingList = () => import('@/views/quality/IncomingInspectSpec/List.vue');
const InspectionPlanList = () => import('@/views/quality/InspectionPlan/List.vue');
const IncomingInspectPlanList = () => import('@/views/quality/IncomingInspectPlan/List.vue');
const QualityReport = () => import('@/views/quality/QualityReport/Index.vue');
const ProductQualitySummary = () => import('@/views/quality/QualityReport/ProductSummary.vue');
const PurchaseInspection = () => import('@/views/quality/QualityReport/PurchaseInspection.vue');
const ProductionInspectionList = () => import('@/views/quality/ProductionInspection/List.vue');

export const qualityRoutes: RouteRecordRaw[] = [
  { path: 'defect-reasons', name: 'DefectReasonList', component: DefectReasonList, meta: {"title":"缺陷原因管理"} },
  { path: 'defect-classes', name: 'DefectClassList', component: DefectClassList, meta: {"title":"缺陷分类管理"} },
  { path: 'defects', name: 'DefectList', component: DefectList, meta: {"title":"缺陷管理"} },
  { path: 'quality-characteristics', name: 'QualityCharacteristicList', component: QualityCharacteristicList, meta: {"title":"质量特性管理"} },
  { path: 'inspection-specs-production', name: 'InspectionSpecProductionList', component: InspectionSpecProductionList, meta: {"title":"生产检验规范"} },
  { path: 'inspection-specs-incoming', name: 'InspectionSpecIncomingList', component: InspectionSpecIncomingList, meta: {"title":"来料检验规范"} },
  { path: 'inspection-plans', name: 'InspectionPlanList', component: InspectionPlanList, meta: {"title":"生产检验方案"} },
  { path: 'incoming-inspect-plans', name: 'IncomingInspectPlanList', component: IncomingInspectPlanList, meta: {"title":"收料检验方案"} },
  { path: 'quality-report', name: 'QualityReport', component: QualityReport, meta: {"title":"生产单质量报告"} },
  { path: 'product-quality-summary', name: 'ProductQualitySummary', component: ProductQualitySummary, meta: {"title":"按产品质量汇总"} },
  { path: 'purchase-inspection', name: 'PurchaseInspection', component: PurchaseInspection, meta: {"title":"采购质量检验"} },
  { path: 'production-inspections', name: 'ProductionInspectionList', component: ProductionInspectionList, meta: {"title":"生产检验管理"} },
];
