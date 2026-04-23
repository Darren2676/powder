import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireRole } from '../../../middleware/role.middleware';
import { submitForApproval, approve, reverseApproval, withdraw, getApprovalLog, batchSubmit, batchApprove, batchWithdraw, batchReverse, getPendingApprovals } from './approval.controller';

const router = Router();

router.get('/pending', authenticate, getPendingApprovals);
router.post('/submit', authenticate, submitForApproval);
router.post('/approve', authenticate, requireRole('manager', 'admin'), approve);
router.post('/reverse', authenticate, requireRole('manager', 'admin'), reverseApproval);
router.post('/withdraw', authenticate, withdraw);
router.get('/log', authenticate, getApprovalLog);

// Batch operations
router.post('/batch-submit', authenticate, batchSubmit);
router.post('/batch-approve', authenticate, requireRole('manager', 'admin'), batchApprove);
router.post('/batch-withdraw', authenticate, batchWithdraw);
router.post('/batch-reverse', authenticate, requireRole('manager', 'admin'), batchReverse);

export default router;
