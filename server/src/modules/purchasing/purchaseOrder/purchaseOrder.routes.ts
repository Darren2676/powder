import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreatePurchaseOrder, validateUpdatePurchaseOrder } from '../../../validators/purchasing.validator';
import {
  getPurchaseOrders, getPurchaseOrderDetail, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
  getPurchaseOrderDetails, addPurchaseOrderDetail, updatePurchaseOrderDetail, deletePurchaseOrderDetail,
  closePurchaseOrder, getReceivable, exportPurchaseOrders, printPurchaseOrder,
  getPurchaseOrderDetailsPage, exportPurchaseOrderDetailsSelected,
  getPurchaseOrderStats, getPurchaseOrderStatusDistribution, getPurchaseOrderSupplierRanking,
  getPurchaseOrderMonthlyTrend, getPurchaseOrderRecentList, getPurchaseOrderDeliveryTrend,
  getPurchaseOrderReconciliationPage, updatePurchaseOrderReconciliationStatus, getPurchaseOrderReconciliationPrintData
} from './purchaseOrder.controller';

const router = Router();

// Dashboard stats (放在 /:id 之前)
router.get('/stats', authenticate, getPurchaseOrderStats);
router.get('/status-distribution', authenticate, getPurchaseOrderStatusDistribution);
router.get('/supplier-ranking', authenticate, getPurchaseOrderSupplierRanking);
router.get('/monthly-trend', authenticate, getPurchaseOrderMonthlyTrend);
router.get('/recent-list', authenticate, getPurchaseOrderRecentList);
router.get('/delivery-trend', authenticate, getPurchaseOrderDeliveryTrend);

// 采购对账
router.get('/reconciliation/page', authenticate, getPurchaseOrderReconciliationPage);
router.put('/reconciliation/status', authenticate, updatePurchaseOrderReconciliationStatus);
router.post('/reconciliation/print', authenticate, getPurchaseOrderReconciliationPrintData);

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
