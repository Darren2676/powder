import { Router } from 'express';
import multer from 'multer';
import { validateCreateInspectionPlan, validateUpdateInspectionPlan } from '../../../validators/quality.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getInspectionPlans,
  createInspectionPlan,
  updateInspectionPlan,
  deleteInspectionPlan,
  exportInspectionPlans,
  importInspectionPlans,
  approveInspectionPlan,
  withdrawInspectionPlan
} from './inspectionPlan.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getInspectionPlans);
router.get('/export', authenticate, exportInspectionPlans);
router.post('/import', authenticate, upload.single('file'), importInspectionPlans);
router.post('/', authenticate, validateCreateInspectionPlan, createInspectionPlan);
router.put('/:id', authenticate, validateUpdateInspectionPlan, updateInspectionPlan);
router.put('/:id/approve', authenticate, approveInspectionPlan);
router.put('/:id/withdraw', authenticate, withdrawInspectionPlan);
router.delete('/:id', authenticate, deleteInspectionPlan);

export default router;
