import { Router } from 'express';
import {
  handleDetectExceptions,
  handleSubmitManualClose,
  handleApproveManualClose,
  handleRejectManualClose,
  handleWithdrawManualClose,
  handleGetPendingManualCloses,
  handleGetCloseReasons,
} from './manualClose.controller';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireRole } from '../../../middleware/role.middleware';

const router = Router();

router.post('/detect', authenticate, requireRole('admin'), handleDetectExceptions);
router.post('/submit', authenticate, requireRole('admin'), handleSubmitManualClose);
router.put('/approve', authenticate, requireRole('admin'), handleApproveManualClose);
router.put('/reject', authenticate, requireRole('admin'), handleRejectManualClose);
router.put('/withdraw', authenticate, requireRole('admin'), handleWithdrawManualClose);
router.get('/pending', authenticate, requireRole('admin'), handleGetPendingManualCloses);
router.get('/reasons/:module', authenticate, requireRole('admin'), handleGetCloseReasons);

export default router;
