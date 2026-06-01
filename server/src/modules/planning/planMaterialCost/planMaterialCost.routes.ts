import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getPlanMaterialCost, getPlanMaterialCostSummary, exportPlanMaterialCost } from './planMaterialCost.controller';

const router = Router();

router.get('/', authenticate, getPlanMaterialCost);
router.get('/summary', authenticate, getPlanMaterialCostSummary);
router.get('/export', authenticate, exportPlanMaterialCost);

export default router;
