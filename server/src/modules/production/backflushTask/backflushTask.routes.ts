/**
 * 倒冲任务清单 - 路由
 */
import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import * as ctrl from './backflushTask.controller';

const router = Router();

router.get('/', authenticate, ctrl.list);
router.get('/export', authenticate, ctrl.exportExcel);
router.get('/summary/:orderNo', authenticate, ctrl.summary);
router.get('/readiness/:orderNo', authenticate, ctrl.readiness);
router.get('/:id/details', authenticate, ctrl.detail);
router.post('/generate', authenticate, ctrl.generate);
router.post('/:id/retry', authenticate, ctrl.retry);

export default router;
