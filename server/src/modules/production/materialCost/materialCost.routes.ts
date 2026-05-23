import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getProductionMaterialCost, getProductionMaterialCostSummary, exportProductionMaterialCost } from './materialCost.controller';

const router = Router();

router.get('/', authenticate, getProductionMaterialCost);
router.get('/summary', authenticate, getProductionMaterialCostSummary);
router.get('/export', authenticate, exportProductionMaterialCost);

export default router;
