import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getPurchaseInvoices, getPurchaseInvoiceDetail, createPurchaseInvoice, updatePurchaseInvoice, deletePurchaseInvoice,
  approvePurchaseInvoice, withdrawPurchaseInvoice,
  getAvailableStockInDetails, getInvoicesByStockInDetail, getInvoicesByPurchaseDetail,
  exportPurchaseInvoices
} from './purchaseInvoice.controller';

const router = Router();

// 特殊路由放在 /:id 之前
router.get('/available-stock-in-details', authenticate, getAvailableStockInDetails);
router.get('/by-stock-in-detail/:detailId', authenticate, getInvoicesByStockInDetail);
router.get('/by-purchase-detail/:detailId', authenticate, getInvoicesByPurchaseDetail);
router.get('/export', authenticate, exportPurchaseInvoices);

// CRUD
router.get('/', authenticate, getPurchaseInvoices);
router.post('/', authenticate, createPurchaseInvoice);
router.get('/:id', authenticate, getPurchaseInvoiceDetail);
router.put('/:id', authenticate, updatePurchaseInvoice);
router.delete('/:id', authenticate, deletePurchaseInvoice);

// 审批
router.post('/:id/approve', authenticate, approvePurchaseInvoice);
router.post('/:id/withdraw', authenticate, withdrawPurchaseInvoice);

export default router;
