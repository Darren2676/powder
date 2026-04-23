import { Router } from 'express';
import { validateCreateIncomingInspectSpec, validateUpdateIncomingInspectSpec } from '../../../validators/quality.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getIncomingInspectSpecs,
  createIncomingInspectSpec,
  updateIncomingInspectSpec,
  deleteIncomingInspectSpec,
  exportIncomingInspectSpecs,
  getIncomingInspectSpecItems,
  addIncomingInspectSpecItem,
  updateIncomingInspectSpecItem,
  deleteIncomingInspectSpecItem,
  approveIncomingInspectSpec,
  withdrawIncomingInspectSpec
} from './incomingInspectSpec.controller';

const router = Router();

router.get('/', authenticate, getIncomingInspectSpecs);
router.get('/export', authenticate, exportIncomingInspectSpecs);
router.post('/', authenticate, validateCreateIncomingInspectSpec, createIncomingInspectSpec);

router.put('/items/:detailId', authenticate, updateIncomingInspectSpecItem);
router.delete('/items/:detailId', authenticate, deleteIncomingInspectSpecItem);

router.put('/:id', authenticate, validateUpdateIncomingInspectSpec, updateIncomingInspectSpec);
router.put('/:id/approve', authenticate, approveIncomingInspectSpec);
router.put('/:id/withdraw', authenticate, withdrawIncomingInspectSpec);
router.delete('/:id', authenticate, deleteIncomingInspectSpec);

router.get('/:headerId/items', authenticate, getIncomingInspectSpecItems);
router.post('/:headerId/items', authenticate, addIncomingInspectSpecItem);

export default router;
