import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { submitForApproval, approve, reverseApproval, withdraw, getApprovalLog } from '../controllers/approval.controller';

const router = Router();

router.post('/submit', authenticate, submitForApproval);
router.post('/approve', authenticate, requireRole('manager', 'admin'), approve);
router.post('/reverse', authenticate, requireRole('manager', 'admin'), reverseApproval);
router.post('/withdraw', authenticate, withdraw);
router.get('/log', authenticate, getApprovalLog);

export default router;
