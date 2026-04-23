// purchasing 域路由
import type { RouteRecordRaw } from 'vue-router';

const PurchaseReqList = () => import('@/views/purchasing/PurchaseReq/List.vue');
const PurchaseReqDetails = () => import('@/views/purchasing/PurchaseReq/Details.vue');
const PurchaseOrderList = () => import('@/views/purchasing/PurchaseOrder/List.vue');
const PurchasePriceList = () => import('@/views/purchasing/PurchasePrice/List.vue');
const PieceRatePriceList = () => import('@/views/purchasing/PieceRatePrice/List.vue');
const PurchaseCalcDemandReport = () => import('@/views/purchasing/PurchaseCalc/DemandReport.vue');

export const purchasingRoutes: RouteRecordRaw[] = [
  { path: 'purchase-reqs', name: 'PurchaseReqList', component: PurchaseReqList, meta: {"title":"采购申请单"} },
  { path: 'purchase-req-details', name: 'PurchaseReqDetails', component: PurchaseReqDetails, meta: {"title":"采购申请明细"} },
  { path: 'purchase-orders', name: 'PurchaseOrderList', component: PurchaseOrderList, meta: {"title":"采购订单"} },
  { path: 'purchase-prices', name: 'PurchasePriceList', component: PurchasePriceList, meta: {"title":"采购价目表"} },
  { path: 'piece-rate-prices', name: 'PieceRatePriceList', component: PieceRatePriceList, meta: {"title":"计件单价管理"} },
  { path: 'purchase-calc', name: 'PurchaseCalcDemandReport', component: PurchaseCalcDemandReport, meta: {"title":"采购需求报表"} },
];
