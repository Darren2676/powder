import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getList,
  getDetail,
  getShippingOrderForReturn,
  getReturnOrderDetailsPage,
  exportReturnOrderDetailsSelected,
  create,
  update,
  remove,
  confirm,
  reject
} from './returnOrder.controller';
import { validateCreateReturnOrder, validateUpdateReturnOrder } from '../../../validators/sales.validator';

const router = Router();

router.get('/', authenticate, getList);
router.get('/details-page', authenticate, getReturnOrderDetailsPage);
router.post('/details-page/export-selected', authenticate, exportReturnOrderDetailsSelected);
router.get('/shipping-order/:shipping_order_number', authenticate, getShippingOrderForReturn);
router.get('/:return_order_number', authenticate, getDetail);
router.post('/', authenticate, validateCreateReturnOrder, create);
router.put('/:return_order_number', authenticate, validateUpdateReturnOrder, update);
router.delete('/:return_order_number', authenticate, remove);
router.post('/:return_order_number/confirm', authenticate, confirm);
router.post('/:return_order_number/reject', authenticate, reject);

export default router;
