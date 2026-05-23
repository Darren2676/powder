import { Router } from 'express';
import { handleTriggerAutoStockCount } from './autoStockCount.controller';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireRole } from '../../../middleware/role.middleware';

const router = Router();

router.post('/trigger', authenticate, requireRole('admin'), handleTriggerAutoStockCount);

export default router;
