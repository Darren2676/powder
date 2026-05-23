import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateMaterialInbound, validateMaterialProductionInbound, validateMaterialOutbound, validateMaterialAdjust, validateMaterialSafetyStock } from '../../../validators/warehouse.validator';
import {
  getInventoryList, manualInbound, getPendingInbound, productionInbound,
  manualOutbound, adjustInventory, getTransactionList,
  getSafetyStockAlerts, updateSafetyStock, getItemOptions, getWarehouseOptions,
  getBatchInventory, getBatchOptions,
  getSemiInboundOrderList, getSemiInboundOrderDetail, withdrawSemiInboundOrder,
  getReturnOutboundList, getReturnOutboundDetail, executeReturnOutbound
} from './materialWarehouse.controller';
import {
  getCompletedMaterialStockCounts, getMaterialMonthlyReport, getMaterialMonthlyReportByPeriod, getStockCountsByWarehouse
} from './materialMonthlyReport.controller';

const router = Router();

router.get('/inventory', authenticate, getInventoryList);
router.post('/inbound', authenticate, validateMaterialInbound, manualInbound);
router.get('/pending-inbound', authenticate, getPendingInbound);
router.post('/production-inbound', authenticate, validateMaterialProductionInbound, productionInbound);
router.get('/semi-inbound-orders', authenticate, getSemiInboundOrderList);
router.get('/semi-inbound-orders/:inbound_order_number', authenticate, getSemiInboundOrderDetail);
router.post('/semi-inbound-orders/:inbound_order_number/withdraw', authenticate, withdrawSemiInboundOrder);
router.post('/outbound', authenticate, validateMaterialOutbound, manualOutbound);
router.post('/adjust', authenticate, validateMaterialAdjust, adjustInventory);
router.get('/transactions', authenticate, getTransactionList);
router.get('/alerts', authenticate, getSafetyStockAlerts);
router.post('/safety-stock', authenticate, validateMaterialSafetyStock, updateSafetyStock);
router.get('/item-options', authenticate, getItemOptions);
router.get('/warehouse-options', authenticate, getWarehouseOptions);
router.get('/batch-inventory', authenticate, getBatchInventory);
router.get('/batch-options', authenticate, getBatchOptions);
router.get('/completed-material-stock-counts', authenticate, getCompletedMaterialStockCounts);
router.get('/stock-counts-by-warehouse', authenticate, getStockCountsByWarehouse);
router.get('/material-monthly-report', authenticate, getMaterialMonthlyReport);
router.get('/material-monthly-report-by-period', authenticate, getMaterialMonthlyReportByPeriod);

// 采购退货出库
router.get('/return-outbound', authenticate, getReturnOutboundList);
router.get('/return-outbound/:id', authenticate, getReturnOutboundDetail);
router.post('/return-outbound/:id/execute', authenticate, executeReturnOutbound);

export default router;
