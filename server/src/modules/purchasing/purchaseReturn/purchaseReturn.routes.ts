import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getPurchaseReturns, getPurchaseReturnDetail, getPOReceivedItems,
  createPurchaseReturn, updatePurchaseReturn, deletePurchaseReturn,
  submitPurchaseReturn, approvePurchaseReturn, rejectPurchaseReturn, withdrawPurchaseReturn,
  executeReturn, exchangeStockIn, printPurchaseReturn
} from './purchaseReturn.controller';

const router = Router();

router.get('/', authenticate, getPurchaseReturns);
router.get('/po-items/:poNumber', authenticate, getPOReceivedItems);
router.get('/:id/print', authenticate, printPurchaseReturn);
router.get('/:id', authenticate, getPurchaseReturnDetail);
router.post('/', authenticate, createPurchaseReturn);
router.put('/:id', authenticate, updatePurchaseReturn);
router.delete('/:id', authenticate, deletePurchaseReturn);
router.post('/:id/submit', authenticate, submitPurchaseReturn);
router.post('/:id/approve', authenticate, approvePurchaseReturn);
router.post('/:id/reject', authenticate, rejectPurchaseReturn);
router.post('/:id/withdraw', authenticate, withdrawPurchaseReturn);
router.post('/:id/execute-return', authenticate, executeReturn);
router.post('/:id/exchange-stock-in', authenticate, exchangeStockIn);

export default router;
