import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getProgressSummary, getProgressOrders } from './progressDashboard.controller';

const router = Router();

router.get('/summary', authenticate, getProgressSummary);
router.get('/orders', authenticate, getProgressOrders);

export default router;
