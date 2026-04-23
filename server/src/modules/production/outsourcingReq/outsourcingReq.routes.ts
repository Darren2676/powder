import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateOutsourcingReq, validateUpdateOutsourcingReq } from '../../../validators/production.validator';
import {
  getOutsourcingReqs,
  getOutsourcingReqDetail,
  createOutsourcingReq,
  updateOutsourcingReq,
  deleteOutsourcingReq,
  toOrder,
  exportOutsourcingReqs
} from './outsourcingReq.controller';

const router = Router();

router.get('/', authenticate, getOutsourcingReqs);
router.get('/export', authenticate, exportOutsourcingReqs);
router.post('/', authenticate, validateCreateOutsourcingReq, createOutsourcingReq);
router.get('/:id', authenticate, getOutsourcingReqDetail);
router.put('/:id', authenticate, validateUpdateOutsourcingReq, updateOutsourcingReq);
router.delete('/:id', authenticate, deleteOutsourcingReq);
router.post('/:id/to-order', authenticate, toOrder);

export default router;
