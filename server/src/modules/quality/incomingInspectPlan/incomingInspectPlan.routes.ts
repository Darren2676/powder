import { Router } from 'express';
import multer from 'multer';
import { validateCreateIncomingInspectPlan, validateUpdateIncomingInspectPlan } from '../../../validators/quality.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getIncomingInspectPlans,
  createIncomingInspectPlan,
  updateIncomingInspectPlan,
  deleteIncomingInspectPlan,
  exportIncomingInspectPlans,
  importIncomingInspectPlans,
  approveIncomingInspectPlan,
  withdrawIncomingInspectPlan
} from './incomingInspectPlan.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getIncomingInspectPlans);
router.get('/export', authenticate, exportIncomingInspectPlans);
router.post('/import', authenticate, upload.single('file'), importIncomingInspectPlans);
router.post('/', authenticate, validateCreateIncomingInspectPlan, createIncomingInspectPlan);
router.put('/:id', authenticate, validateUpdateIncomingInspectPlan, updateIncomingInspectPlan);
router.put('/:id/approve', authenticate, approveIncomingInspectPlan);
router.put('/:id/withdraw', authenticate, withdrawIncomingInspectPlan);
router.delete('/:id', authenticate, deleteIncomingInspectPlan);

export default router;
