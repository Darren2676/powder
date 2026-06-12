import { Router } from 'express';
import {
  getBatchNumberRules,
  getBatchNumberRuleById,
  createBatchNumberRule,
  updateBatchNumberRule,
  deleteBatchNumberRule,
  lookupBatchNumberRule,
  approveBatchNumberRule,
  withdrawBatchNumberRule,
} from './batchNumberRule.controller';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireRole } from '../../../middleware/role.middleware';

const router = Router();

router.get('/', authenticate, requireRole('admin'), getBatchNumberRules);
router.get('/lookup', authenticate, requireRole('admin'), lookupBatchNumberRule);
router.get('/:id', authenticate, requireRole('admin'), getBatchNumberRuleById);
router.post('/', authenticate, requireRole('admin'), createBatchNumberRule);
router.put('/:id', authenticate, requireRole('admin'), updateBatchNumberRule);
router.delete('/:id', authenticate, requireRole('admin'), deleteBatchNumberRule);
router.post('/:id/approve', authenticate, requireRole('admin'), approveBatchNumberRule);
router.post('/:id/withdraw', authenticate, requireRole('admin'), withdrawBatchNumberRule);

export default router;
