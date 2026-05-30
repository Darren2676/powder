import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../middleware/auth.middleware';
import { dataScope } from '../../../middleware/data-scope.middleware';
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
router.get('/stats', authenticate, dataScope, getSalesOrderStats);
router.get('/status-distribution', authenticate, dataScope, getSalesOrderStatusDistribution);
router.get('/customer-ranking', authenticate, dataScope, getSalesOrderCustomerRanking);
router.get('/monthly-trend', authenticate, dataScope, getSalesOrderMonthlyTrend);
router.get('/recent-list', authenticate, dataScope, getSalesOrderRecentList);
router.get('/delivery-trend', authenticate, dataScope, getSalesOrderDeliveryTrend);
router.get('/details-page', authenticate, dataScope, getSalesOrderDetailsPage);
router.post('/details-page/export-selected', authenticate, dataScope, exportSalesOrderDetailsSelected);

// Header
router.get('/', authenticate, dataScope, getSalesOrders);
router.get('/export', authenticate, dataScope, exportSalesOrders);
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
