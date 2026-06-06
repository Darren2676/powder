// warehouse 域路由
import type { RouteRecordRaw } from 'vue-router';

const MaterialWarehouseInventory = () => import('@/views/warehouse/MaterialWarehouse/Inventory.vue');
const MaterialWarehouseInbound = () => import('@/views/warehouse/MaterialWarehouse/Inbound.vue');
const MaterialWarehouseProductionInbound = () => import('@/views/warehouse/MaterialWarehouse/ProductionInbound.vue');
const MaterialWarehouseSemiInboundOrder = () => import('@/views/warehouse/MaterialWarehouse/SemiInboundOrder.vue');
const MaterialWarehouseOutbound = () => import('@/views/warehouse/MaterialWarehouse/Outbound.vue');
const MaterialWarehouseReturnOutbound = () => import('@/views/warehouse/MaterialWarehouse/ReturnOutbound.vue');
const MaterialWarehouseTransaction = () => import('@/views/warehouse/MaterialWarehouse/Transaction.vue');
const MaterialWarehouseSafetyStock = () => import('@/views/warehouse/MaterialWarehouse/SafetyStock.vue');
const FinishedGoodsInventoryQuery = () => import('@/views/warehouse/FinishedGoods/InventoryQuery.vue');
const FinishedGoodsInbound = () => import('@/views/warehouse/FinishedGoods/Inbound.vue');
const FinishedGoodsInboundOrder = () => import('@/views/warehouse/FinishedGoods/InboundOrder.vue');
const FinishedGoodsOutbound = () => import('@/views/warehouse/FinishedGoods/Outbound.vue');
const FinishedGoodsTransaction = () => import('@/views/warehouse/FinishedGoods/Transaction.vue');
const FinishedGoodsAbnormalIO = () => import('@/views/warehouse/FinishedGoods/AbnormalIO.vue');
const StockCountList = () => import('@/views/warehouse/StockCount/List.vue');
const StockCountReport = () => import('@/views/warehouse/StockCount/Report.vue');
const FinishedGoodsMonthlyReport = () => import('@/views/warehouse/FinishedGoods/MonthlyReport.vue');
const MaterialMonthlyReport = () => import('@/views/warehouse/MaterialWarehouse/MonthlyReport.vue');
const ScrapMonthlyReport = () => import('@/views/warehouse/ScrapDisposal/MonthlyReport.vue');
const FinishedGoodsReturnInbound = () => import('@/views/warehouse/FinishedGoods/ReturnInbound.vue');
const StockInList = () => import('@/views/warehouse/StockIn/List.vue');
const FinishedGoodsPackingOrder = () => import('@/views/warehouse/FinishedGoods/PackingOrder.vue');
const ScrapDisposalList = () => import('@/views/warehouse/ScrapDisposal/List.vue');
const ScrapInboundOrderList = () => import('@/views/quality/ScrapInboundOrder/List.vue');
const ScrapInventoryList = () => import('@/views/warehouse/ScrapInventory/List.vue');
const ScrapTransactionList = () => import('@/views/warehouse/ScrapTransaction/List.vue');
const ShelfLifeReport = () => import('@/views/warehouse/ShelfLifeReport/Index.vue');

export const warehouseRoutes: RouteRecordRaw[] = [
  { path: 'mw-inventory', name: 'MaterialWarehouseInventory', component: MaterialWarehouseInventory, meta: {"title":"物料库存总览"} },
  { path: 'mw-inbound', name: 'MaterialWarehouseInbound', component: MaterialWarehouseInbound, meta: {"title":"采购入库"} },
  { path: 'mw-production-inbound', name: 'MaterialWarehouseProductionInbound', component: MaterialWarehouseProductionInbound, meta: {"title":"半成品生产入库"} },
  { path: 'mw-semi-inbound-orders', name: 'MaterialWarehouseSemiInboundOrder', component: MaterialWarehouseSemiInboundOrder, meta: {"title":"半成品生产入库单"} },
  { path: 'mw-outbound', name: 'MaterialWarehouseOutbound', component: MaterialWarehouseOutbound, meta: {"title":"物料出库"} },
  { path: 'mw-return-outbound', name: 'MaterialWarehouseReturnOutbound', component: MaterialWarehouseReturnOutbound, meta: {"title":"采购退货出库"} },
  { path: 'mw-transactions', name: 'MaterialWarehouseTransaction', component: MaterialWarehouseTransaction, meta: {"title":"物料流水记录"} },
  { path: 'mw-safety-stock', name: 'MaterialWarehouseSafetyStock', component: MaterialWarehouseSafetyStock, meta: {"title":"安全库存预警"} },
  { path: 'fg-inventory-query', name: 'FinishedGoodsInventoryQuery', component: FinishedGoodsInventoryQuery, meta: {"title":"成品库存查询"} },
  { path: 'fg-inbound', name: 'FinishedGoodsInbound', component: FinishedGoodsInbound, meta: {"title":"生产完工入库"} },
  { path: 'fg-inbound-orders', name: 'FinishedGoodsInboundOrder', component: FinishedGoodsInboundOrder, meta: {"title":"生产入库单"} },
  { path: 'fg-outbound', name: 'FinishedGoodsOutbound', component: FinishedGoodsOutbound, meta: {"title":"发货出库"} },
  { path: 'fg-transactions', name: 'FinishedGoodsTransaction', component: FinishedGoodsTransaction, meta: {"title":"库存流水记录"} },
  { path: 'fg-abnormal-io', name: 'FinishedGoodsAbnormalIO', component: FinishedGoodsAbnormalIO, meta: {"title":"其他出入库"} },
  { path: 'fg-stock-count', name: 'StockCountList', component: StockCountList, meta: {"title":"月末盘点"} },
  { path: 'fg-stock-count-report', name: 'StockCountReport', component: StockCountReport, meta: {"title":"盘点报表"} },
  { path: 'fg-monthly-report', name: 'FinishedGoodsMonthlyReport', component: FinishedGoodsMonthlyReport, meta: {"title":"成品仓月度报表"} },
  { path: 'material-monthly-report', name: 'MaterialMonthlyReport', component: MaterialMonthlyReport, meta: {"title":"原料仓月度报表"} },
  { path: 'scrap-monthly-report', name: 'ScrapMonthlyReport', component: ScrapMonthlyReport, meta: {"title":"报废仓月度报表"} },
  { path: 'fg-return-inbound', name: 'FinishedGoodsReturnInbound', component: FinishedGoodsReturnInbound, meta: {"title":"退货入库"} },
  { path: 'fg-packing-orders', name: 'FinishedGoodsPackingOrder', component: FinishedGoodsPackingOrder, meta: {"title":"装箱管理"} },
  { path: 'stock-ins', name: 'StockInList', component: StockInList, meta: {"title":"来料入库"} },
  { path: 'scrap-disposal', name: 'ScrapDisposalList', component: ScrapDisposalList, meta: {"title":"报废仓处置"} },
  { path: 'scrap-inbound-orders', name: 'ScrapInboundOrderList', component: ScrapInboundOrderList, meta: {"title":"报废入库单"} },
  { path: 'scrap-inventory', name: 'ScrapInventoryList', component: ScrapInventoryList, meta: {"title":"报废仓库存"} },
  { path: 'scrap-transactions', name: 'ScrapTransactionList', component: ScrapTransactionList, meta: {"title":"库存流水记录"} },
  { path: 'shelf-life-report', name: 'ShelfLifeReport', component: ShelfLifeReport, meta: {"title":"有效期管理报告"} },
];
