// sales 域路由
import type { RouteRecordRaw } from 'vue-router';

const SalesOrderList = () => import('@/views/sales/SalesOrder/List.vue');
const SalesOrderDetails = () => import('@/views/sales/SalesOrder/Details.vue');
const SalesPriceList = () => import('@/views/sales/SalesPrice/List.vue');
const ForecastList = () => import('@/views/sales/Forecast/List.vue');
const ForecastDetails = () => import('@/views/sales/Forecast/Details.vue');
const PendingShipments = () => import('@/views/sales/ShippingRequest/Pending.vue');
const ShippingRequestList = () => import('@/views/sales/ShippingRequest/List.vue');
const PendingRequestDetails = () => import('@/views/sales/ShippingRequest/PendingDetails.vue');
const ShippingOrderList = () => import('@/views/sales/ShippingOrder/List.vue');
const ShippingOrderDetails = () => import('@/views/sales/ShippingOrder/OrderDetails.vue');
const ReturnOrderList = () => import('@/views/sales/ReturnOrder/List.vue');
const ReturnOrderDetails = () => import('@/views/sales/ReturnOrder/Details.vue');
const SalesReport = () => import('@/views/sales/SalesReport/Index.vue');
const ShippingWarning = () => import('@/views/sales/ShippingWarning/List.vue');
const ShippingByOrderSummary = () => import('@/views/sales/ShippingByOrderSummary/List.vue');

export const salesRoutes: RouteRecordRaw[] = [
  { path: 'sales-orders', name: 'SalesOrderList', component: SalesOrderList, meta: {"title":"销售订单"} },
  { path: 'sales-order-details', name: 'SalesOrderDetails', component: SalesOrderDetails, meta: {"title":"销售订单明细"} },
  { path: 'sales-prices', name: 'SalesPriceList', component: SalesPriceList, meta: {"title":"销售价目表"} },
  { path: 'forecasts', name: 'ForecastList', component: ForecastList, meta: {"title":"销售预测"} },
  { path: 'forecast-details', name: 'ForecastDetails', component: ForecastDetails, meta: {"title":"销售预测明细"} },
  { path: 'pending-shipments', name: 'PendingShipments', component: PendingShipments, meta: {"title":"待发货列表"} },
  { path: 'shipping-requests', name: 'ShippingRequestList', component: ShippingRequestList, meta: {"title":"发货申请管理"} },
  { path: 'pending-request-details', name: 'PendingRequestDetails', component: PendingRequestDetails, meta: {"title":"发货申请明细"} },
  { path: 'shipping-orders-list', name: 'ShippingOrderList', component: ShippingOrderList, meta: {"title":"发货单管理"} },
  { path: 'shipping-order-details', name: 'ShippingOrderDetails', component: ShippingOrderDetails, meta: {"title":"发货单明细"} },
  { path: 'return-orders', name: 'ReturnOrderList', component: ReturnOrderList, meta: {"title":"退货管理"} },
  { path: 'return-order-details', name: 'ReturnOrderDetails', component: ReturnOrderDetails, meta: {"title":"退货单明细"} },
  { path: 'sales-report', name: 'SalesReport', component: SalesReport, meta: {"title":"销售退货报表"} },
  { path: 'shipping-warning', name: 'ShippingWarning', component: ShippingWarning, meta: {"title":"发货预警"} },
  { path: 'overdue-shipping', name: 'OverdueShipping', component: ShippingWarning, meta: {"title":"逾期发货报告"} },
  { path: 'shipping-by-order-summary', name: 'ShippingByOrderSummary', component: ShippingByOrderSummary, meta: {"title":"发货按订单汇总表"} },
];
