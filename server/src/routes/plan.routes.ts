import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { getPlans, createPlan, updatePlan, deletePlan, exportPlans, importPlans } from '../controllers/plan.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getPlans);
router.get('/export', authenticate, exportPlans);
router.post('/import', authenticate, upload.single('file'), importPlans);
router.post('/', authenticate, createPlan);
router.put('/:id', authenticate, updatePlan);
router.delete('/:id', authenticate, deletePlan);

export default router;
