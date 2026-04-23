// warehouse 域路由
import type { RouteRecordRaw } from 'vue-router';

const MaterialWarehouseInventory = () => import('@/views/warehouse/MaterialWarehouse/Inventory.vue');
const MaterialWarehouseInbound = () => import('@/views/warehouse/MaterialWarehouse/Inbound.vue');
const MaterialWarehouseOutbound = () => import('@/views/warehouse/MaterialWarehouse/Outbound.vue');
const MaterialWarehouseTransaction = () => import('@/views/warehouse/MaterialWarehouse/Transaction.vue');
const MaterialWarehouseSafetyStock = () => import('@/views/warehouse/MaterialWarehouse/SafetyStock.vue');
const FinishedGoodsInventory = () => import('@/views/warehouse/FinishedGoods/Inventory.vue');
const FinishedGoodsInbound = () => import('@/views/warehouse/FinishedGoods/Inbound.vue');
const FinishedGoodsInboundOrder = () => import('@/views/warehouse/FinishedGoods/InboundOrder.vue');
const FinishedGoodsOutbound = () => import('@/views/warehouse/FinishedGoods/Outbound.vue');
const FinishedGoodsTransaction = () => import('@/views/warehouse/FinishedGoods/Transaction.vue');
const FinishedGoodsAbnormalIO = () => import('@/views/warehouse/FinishedGoods/AbnormalIO.vue');
const StockCountList = () => import('@/views/warehouse/StockCount/List.vue');
const StockCountReport = () => import('@/views/warehouse/StockCount/Report.vue');
const FinishedGoodsMonthlyReport = () => import('@/views/warehouse/FinishedGoods/MonthlyReport.vue');
const FinishedGoodsReturnInbound = () => import('@/views/warehouse/FinishedGoods/ReturnInbound.vue');
const StockInList = () => import('@/views/warehouse/StockIn/List.vue');

export const warehouseRoutes: RouteRecordRaw[] = [
  { path: 'mw-inventory', name: 'MaterialWarehouseInventory', component: MaterialWarehouseInventory, meta: {"title":"物料库存总览"} },
  { path: 'mw-inbound', name: 'MaterialWarehouseInbound', component: MaterialWarehouseInbound, meta: {"title":"物料入库"} },
  { path: 'mw-outbound', name: 'MaterialWarehouseOutbound', component: MaterialWarehouseOutbound, meta: {"title":"物料出库"} },
  { path: 'mw-transactions', name: 'MaterialWarehouseTransaction', component: MaterialWarehouseTransaction, meta: {"title":"物料流水记录"} },
  { path: 'mw-safety-stock', name: 'MaterialWarehouseSafetyStock', component: MaterialWarehouseSafetyStock, meta: {"title":"安全库存预警"} },
  { path: 'fg-inventory', name: 'FinishedGoodsInventory', component: FinishedGoodsInventory, meta: {"title":"成品库存总览"} },
  { path: 'fg-inbound', name: 'FinishedGoodsInbound', component: FinishedGoodsInbound, meta: {"title":"生产完工入库"} },
  { path: 'fg-inbound-orders', name: 'FinishedGoodsInboundOrder', component: FinishedGoodsInboundOrder, meta: {"title":"生产入库单"} },
  { path: 'fg-outbound', name: 'FinishedGoodsOutbound', component: FinishedGoodsOutbound, meta: {"title":"发货出库"} },
  { path: 'fg-transactions', name: 'FinishedGoodsTransaction', component: FinishedGoodsTransaction, meta: {"title":"库存流水记录"} },
  { path: 'fg-abnormal-io', name: 'FinishedGoodsAbnormalIO', component: FinishedGoodsAbnormalIO, meta: {"title":"异常出入库"} },
  { path: 'fg-stock-count', name: 'StockCountList', component: StockCountList, meta: {"title":"月末盘点"} },
  { path: 'fg-stock-count-report', name: 'StockCountReport', component: StockCountReport, meta: {"title":"盘点报表"} },
  { path: 'fg-monthly-report', name: 'FinishedGoodsMonthlyReport', component: FinishedGoodsMonthlyReport, meta: {"title":"月度出入库报表"} },
  { path: 'fg-return-inbound', name: 'FinishedGoodsReturnInbound', component: FinishedGoodsReturnInbound, meta: {"title":"退货入库"} },
  { path: 'stock-ins', name: 'StockInList', component: StockInList, meta: {"title":"来料入库"} },
];
