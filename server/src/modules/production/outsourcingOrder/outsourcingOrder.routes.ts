import { Router } from 'express';
import { validateCreateOutsourcingOrder, validateUpdateOutsourcingOrder } from '../../../validators/production.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getOutsourcingOrders,
  getOutsourcingOrderDetail,
  createOutsourcingOrder,
  updateOutsourcingOrder,
  deleteOutsourcingOrder,
  sendOut,
  confirmReceipt,
  closeOutsourcingOrder,
  exportOutsourcingOrders
} from './outsourcingOrder.controller';

const router = Router();

router.get('/', authenticate, getOutsourcingOrders);
router.get('/export', authenticate, exportOutsourcingOrders);
router.post('/', authenticate, validateCreateOutsourcingOrder, createOutsourcingOrder);
router.get('/:id', authenticate, getOutsourcingOrderDetail);
router.put('/:id', authenticate, validateUpdateOutsourcingOrder, updateOutsourcingOrder);
router.delete('/:id', authenticate, deleteOutsourcingOrder);
router.post('/:id/send-out', authenticate, sendOut);
router.post('/:id/confirm-receipt', authenticate, confirmReceipt);
router.post('/:id/close', authenticate, closeOutsourcingOrder);

export default router;
