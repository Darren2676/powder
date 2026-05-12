import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreatePurchaseOrder, validateUpdatePurchaseOrder } from '../../../validators/purchasing.validator';
import {
  getPurchaseOrders, getPurchaseOrderDetail, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
  getPurchaseOrderDetails, addPurchaseOrderDetail, updatePurchaseOrderDetail, deletePurchaseOrderDetail,
  closePurchaseOrder, getReceivable, exportPurchaseOrders, printPurchaseOrder,
  getPurchaseOrderDetailsPage, exportPurchaseOrderDetailsSelected
} from './purchaseOrder.controller';

const router = Router();

// Header
router.get('/', authenticate, getPurchaseOrders);
router.get('/export', authenticate, exportPurchaseOrders);
router.get('/details-page', authenticate, getPurchaseOrderDetailsPage);
router.post('/details-page/export-selected', authenticate, exportPurchaseOrderDetailsSelected);
router.post('/', authenticate, validateCreatePurchaseOrder, createPurchaseOrder);
router.get('/:id', authenticate, getPurchaseOrderDetail);
router.put('/:id', authenticate, validateUpdatePurchaseOrder, updatePurchaseOrder);
router.delete('/:id', authenticate, deletePurchaseOrder);

// 关闭 & 可入库明细
router.put('/:id/close', authenticate, closePurchaseOrder);
router.get('/:id/receivable', authenticate, getReceivable);

// 打印
router.get('/:id/print', authenticate, printPurchaseOrder);

// Detail
router.get('/:headerId/details', authenticate, getPurchaseOrderDetails);
router.post('/:headerId/details', authenticate, addPurchaseOrderDetail);
router.put('/details/:detailId', authenticate, updatePurchaseOrderDetail);
router.delete('/details/:detailId', authenticate, deletePurchaseOrderDetail);

export default router;
