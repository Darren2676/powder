import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  createShippingOrder,
  getShippingOrderDetailsPage,
  exportShippingOrderDetailsSelected,
  getShippingOrders,
  getShippingOrderDetail,
  updateLogistics,
  updateStatus,
  cancelShippingOrder,
  getPrintData
} from './shippingOrder.controller';
import { validateCreateShippingOrder, validateUpdateShippingOrder } from '../../../validators/sales.validator';

const router = Router();

router.post('/', authenticate, validateCreateShippingOrder, createShippingOrder);
router.get('/details-page', authenticate, getShippingOrderDetailsPage);
router.post('/details-page/export-selected', authenticate, exportShippingOrderDetailsSelected);
router.get('/', authenticate, getShippingOrders);
router.get('/:shipping_order_number/print', authenticate, getPrintData);
router.get('/:shipping_order_number', authenticate, getShippingOrderDetail);
router.put('/:shipping_order_number/logistics', authenticate, updateLogistics);
router.put('/:shipping_order_number/status', authenticate, updateStatus);
router.post('/:shipping_order_number/cancel', authenticate, cancelShippingOrder);

export default router;
