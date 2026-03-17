import { Router } from 'express';
import {
  getStats,
  getStatusDistribution,
  getPriorityDistribution,
  getAssigneeWorkload,
  getTrend,
  getMyStats
} from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/stats', authenticate, getStats);
router.get('/status-distribution', authenticate, getStatusDistribution);
router.get('/priority-distribution', authenticate, getPriorityDistribution);
router.get('/assignee-workload', authenticate, getAssigneeWorkload);
router.get('/trend', authenticate, getTrend);
router.get('/my-stats', authenticate, getMyStats);

export default router;
