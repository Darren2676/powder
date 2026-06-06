import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getStockIns, getStockInDetail, createStockIn, deleteStockIn,
  confirmStockIn, withdrawStockIn, exportStockIns,
  getPurchaseReconciliationPage, updatePurchaseReconciliationStatus, getPurchaseReconciliationPrintData
} from './stockIn.controller';
import { validateCreateStockIn } from '../../../validators/warehouse.validator';

const router = Router();

router.get('/', authenticate, getStockIns);
router.get('/export', authenticate, exportStockIns);
router.get('/reconciliation/page', authenticate, getPurchaseReconciliationPage);
router.put('/reconciliation/status', authenticate, updatePurchaseReconciliationStatus);
router.post('/reconciliation/print', authenticate, getPurchaseReconciliationPrintData);
router.post('/', authenticate, validateCreateStockIn, createStockIn);
router.get('/:id', authenticate, getStockInDetail);
router.delete('/:id', authenticate, deleteStockIn);
router.post('/:id/confirm', authenticate, confirmStockIn);
router.post('/:id/withdraw', authenticate, withdrawStockIn);

export default router;
