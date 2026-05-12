import { Router } from 'express';
import { apiKeyAuth } from '../../../middleware/apiKeyAuth.middleware';
import { requirePermission } from '../../../middleware/apiKeyPermission.middleware';
import { openGetOrders, openGetOrderDetail, openCreateOrder, openUpdateOrder } from './orders.controller';

const router = Router();

router.get('/', apiKeyAuth, requirePermission('order', 'read'), openGetOrders);
router.get('/:id', apiKeyAuth, requirePermission('order', 'read'), openGetOrderDetail);
router.post('/', apiKeyAuth, requirePermission('order', 'write'), openCreateOrder);
router.put('/:id', apiKeyAuth, requirePermission('order', 'write'), openUpdateOrder);

export default router;
