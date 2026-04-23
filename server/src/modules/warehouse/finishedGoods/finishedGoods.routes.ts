import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getInventoryList,
  getInventoryDetail,
  getPendingInbound,
  productionInbound,
  getInboundOrderList,
  getInboundOrderDetail,
  getPendingOutbound,
  shippingOutbound,
  getTransactionList,
  adjustInventory,
  getWarehouseOptions,
  getFinishedBatchInventory,
  getFinishedBatchOptions,
  updateFinishedGoodsSafetyStock,
  getPendingReturnInbound,
  getReturnInboundDetail,
  returnInbound,
  getCompletedStockCounts,
  getMonthlyReport
} from './finishedGoods.controller';
import { validateFinishedGoodsInbound, validateFinishedGoodsOutbound, validateFinishedGoodsAdjust, validateFinishedGoodsSafetyStock, validateFinishedGoodsReturnInbound } from '../../../validators/warehouse.validator';

const router = Router();

// 仓库下拉选项
router.get('/warehouse-options', authenticate, getWarehouseOptions);

// 成品库存
router.get('/inventory', authenticate, getInventoryList);
router.get('/inventory/detail', authenticate, getInventoryDetail);

// 入库管理
router.get('/pending-inbound', authenticate, getPendingInbound);
router.post('/inbound', authenticate, productionInbound);

// 生产入库单
router.get('/inbound-orders', authenticate, getInboundOrderList);
router.get('/inbound-orders/:inbound_order_number', authenticate, getInboundOrderDetail);

// 出库管理
router.get('/pending-outbound', authenticate, getPendingOutbound);
router.post('/outbound', authenticate, shippingOutbound);

// 库存流水
router.get('/transactions', authenticate, getTransactionList);

// 手动调整
router.post('/adjust', authenticate, adjustInventory);

// 批次库存
router.get('/batch-inventory', authenticate, getFinishedBatchInventory);
router.get('/batch-options', authenticate, getFinishedBatchOptions);

// 安全库存
router.put('/safety-stock', authenticate, validateFinishedGoodsSafetyStock, updateFinishedGoodsSafetyStock);

// 退货入库
router.get('/return-inbound/pending', authenticate, getPendingReturnInbound);
router.get('/return-inbound/:return_order_number', authenticate, getReturnInboundDetail);
router.post('/return-inbound/:return_order_number', authenticate, validateFinishedGoodsReturnInbound, returnInbound);

// 月度出入库报表
router.get('/completed-stock-counts', authenticate, getCompletedStockCounts);
router.get('/monthly-report', authenticate, getMonthlyReport);

export default router;
