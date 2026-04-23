import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateMaterialInbound, validateMaterialProductionInbound, validateMaterialOutbound, validateMaterialAdjust, validateMaterialSafetyStock } from '../../../validators/warehouse.validator';
import {
  getInventoryList, manualInbound, getPendingInbound, productionInbound,
  manualOutbound, adjustInventory, getTransactionList,
  getSafetyStockAlerts, updateSafetyStock, getItemOptions, getWarehouseOptions,
  getBatchInventory, getBatchOptions
} from './materialWarehouse.controller';

const router = Router();

router.get('/inventory', authenticate, getInventoryList);
router.post('/inbound', authenticate, validateMaterialInbound, manualInbound);
router.get('/pending-inbound', authenticate, getPendingInbound);
router.post('/production-inbound', authenticate, validateMaterialProductionInbound, productionInbound);
router.post('/outbound', authenticate, validateMaterialOutbound, manualOutbound);
router.post('/adjust', authenticate, validateMaterialAdjust, adjustInventory);
router.get('/transactions', authenticate, getTransactionList);
router.get('/alerts', authenticate, getSafetyStockAlerts);
router.post('/safety-stock', authenticate, validateMaterialSafetyStock, updateSafetyStock);
router.get('/item-options', authenticate, getItemOptions);
router.get('/warehouse-options', authenticate, getWarehouseOptions);
router.get('/batch-inventory', authenticate, getBatchInventory);
router.get('/batch-options', authenticate, getBatchOptions);

export default router;
