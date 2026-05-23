// purchasing 域路由
import type { RouteRecordRaw } from 'vue-router';

const PurchaseReqList = () => import('@/views/purchasing/PurchaseReq/List.vue');
const PurchaseReqDetails = () => import('@/views/purchasing/PurchaseReq/Details.vue');
const PurchaseOrderList = () => import('@/views/purchasing/PurchaseOrder/List.vue');
const PurchaseOrderDetails = () => import('@/views/purchasing/PurchaseOrder/Details.vue');
const PurchasePriceList = () => import('@/views/purchasing/PurchasePrice/List.vue');
const PurchaseCalcDemandReport = () => import('@/views/purchasing/PurchaseCalc/DemandReport.vue');
const ReceivingNoticeList = () => import('@/views/purchasing/ReceivingNotice/List.vue');
const PurchaseReturnList = () => import('@/views/purchasing/PurchaseReturn/List.vue');
const PurchaseInvoiceList = () => import('@/views/purchasing/PurchaseInvoice/List.vue');
const PurchasingDashboard = () => import('@/views/purchasing/PurchasingDashboard/Index.vue');

export const purchasingRoutes: RouteRecordRaw[] = [
  { path: 'purchase-reqs', name: 'PurchaseReqList', component: PurchaseReqList, meta: {"title":"采购申请单"} },
  { path: 'purchase-req-details', name: 'PurchaseReqDetails', component: PurchaseReqDetails, meta: {"title":"采购申请明细"} },
  { path: 'purchase-orders', name: 'PurchaseOrderList', component: PurchaseOrderList, meta: {"title":"采购订单"} },
  { path: 'purchase-order-details', name: 'PurchaseOrderDetails', component: PurchaseOrderDetails, meta: {"title":"采购订单明细"} },
  { path: 'purchase-prices', name: 'PurchasePriceList', component: PurchasePriceList, meta: {"title":"采购价目表"} },
  { path: 'purchase-calc', name: 'PurchaseCalcDemandReport', component: PurchaseCalcDemandReport, meta: {"title":"采购需求报表"} },
  { path: 'receiving-notices', name: 'ReceivingNoticeList', component: ReceivingNoticeList, meta: {"title":"采购收货通知"} },
  { path: 'purchase-returns', name: 'PurchaseReturnList', component: PurchaseReturnList, meta: {"title":"采购退货"} },
  { path: 'purchase-invoices', name: 'PurchaseInvoiceList', component: PurchaseInvoiceList, meta: {"title":"采购发票"} },
  { path: 'purchasing-dashboard', name: 'PurchasingDashboard', component: PurchasingDashboard, meta: {"title":"采购订单仪表板"} },
];
