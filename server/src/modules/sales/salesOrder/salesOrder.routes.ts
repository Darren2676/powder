import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateSalesOrder } from '../../../validators/order.validator';
import {
  getSalesOrders, getSalesOrderDetail, createSalesOrder, updateSalesOrder, deleteSalesOrder,
  getSalesOrderDetails, addSalesOrderDetail, updateSalesOrderDetail, deleteSalesOrderDetail,
  exportSalesOrders, importSalesOrders,
  getSalesOrderStats, getSalesOrderStatusDistribution, getSalesOrderCustomerRanking,
  getSalesOrderMonthlyTrend, getSalesOrderRecentList, getSalesOrderDeliveryTrend,
  getSalesOrderDetailsPage,
  exportSalesOrderDetailsSelected
} from './salesOrder.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Dashboard stats (放在 /:id 之前)
router.get('/stats', authenticate, getSalesOrderStats);
router.get('/status-distribution', authenticate, getSalesOrderStatusDistribution);
router.get('/customer-ranking', authenticate, getSalesOrderCustomerRanking);
router.get('/monthly-trend', authenticate, getSalesOrderMonthlyTrend);
router.get('/recent-list', authenticate, getSalesOrderRecentList);
router.get('/delivery-trend', authenticate, getSalesOrderDeliveryTrend);
router.get('/details-page', authenticate, getSalesOrderDetailsPage);
router.post('/details-page/export-selected', authenticate, exportSalesOrderDetailsSelected);

// Header
router.get('/', authenticate, getSalesOrders);
router.get('/export', authenticate, exportSalesOrders);
router.post('/import', authenticate, upload.single('file'), importSalesOrders);
router.post('/', authenticate, validateCreateSalesOrder, createSalesOrder);
router.get('/:id', authenticate, getSalesOrderDetail);
router.put('/:id', authenticate, updateSalesOrder);
router.delete('/:id', authenticate, deleteSalesOrder);

// Detail
router.get('/:headerId/details', authenticate, getSalesOrderDetails);
router.post('/:headerId/details', authenticate, addSalesOrderDetail);
router.put('/details/:detailId', authenticate, updateSalesOrderDetail);
router.delete('/details/:detailId', authenticate, deleteSalesOrderDetail);

export default router;
