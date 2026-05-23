import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getSalesInvoices, getSalesInvoiceDetail, createSalesInvoice, updateSalesInvoice, deleteSalesInvoice,
  approveSalesInvoice, withdrawSalesInvoice,
  getAvailableShippingDetails, getInvoicesByShippingDetail, getInvoicesBySalesDetail,
  exportSalesInvoices, importSalesInvoices
} from './salesInvoice.controller';

const router = Router();

// 特殊路由放在 /:id 之前
router.get('/available-shipping-details', authenticate, getAvailableShippingDetails);
router.get('/by-shipping-detail/:detailId', authenticate, getInvoicesByShippingDetail);
router.get('/by-sales-detail/:detailId', authenticate, getInvoicesBySalesDetail);
router.get('/export', authenticate, exportSalesInvoices);
router.post('/import', authenticate, importSalesInvoices);

// CRUD
router.get('/', authenticate, getSalesInvoices);
router.post('/', authenticate, createSalesInvoice);
router.get('/:id', authenticate, getSalesInvoiceDetail);
router.put('/:id', authenticate, updateSalesInvoice);
router.delete('/:id', authenticate, deleteSalesInvoice);

// 审批
router.post('/:id/approve', authenticate, approveSalesInvoice);
router.post('/:id/withdraw', authenticate, withdrawSalesInvoice);

export default router;
