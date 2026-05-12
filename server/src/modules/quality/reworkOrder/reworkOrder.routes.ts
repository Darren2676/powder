import { Router } from 'express';
import {
  getReworkOrders,
  getReworkOrderDetail,
  completeRework,
  reworkReInspect,
  exportReworkOrders
} from './reworkOrder.controller';
import { authenticate } from '../../../middleware/auth.middleware';
import { requirePermission } from '../../../middleware/permission.middleware';

const router = Router();

router.get('/', authenticate, requirePermission('quality'), getReworkOrders);
router.get('/:id', authenticate, requirePermission('quality'), getReworkOrderDetail);
router.post('/:id/complete', authenticate, requirePermission('quality'), completeRework);
router.post('/:id/re-inspect', authenticate, requirePermission('quality'), reworkReInspect);
router.get('/export/list', authenticate, requirePermission('quality'), exportReworkOrders);

export default router;
