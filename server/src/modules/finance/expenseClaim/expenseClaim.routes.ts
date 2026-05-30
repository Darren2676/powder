import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireRole } from '../../../middleware/role.middleware';
import { upload } from '../../../middleware/upload.middleware';
import {
  getExpenseClaims, getClaimTypes, getExpenseClaimDetail,
  createExpenseClaim, updateExpenseClaim, deleteExpenseClaim,
  submitExpenseClaim, approveExpenseClaim, rejectExpenseClaim,
  withdrawExpenseClaim, reverseExpenseClaim,
  uploadAttachment, deleteAttachment,
} from './expenseClaim.controller';

const router = Router();

// 字典（静态路径放 :id 前）
router.get('/claim-types', authenticate, getClaimTypes);

// 主表 CRUD
router.get('/', authenticate, getExpenseClaims);
router.post('/', authenticate, createExpenseClaim);
router.get('/:id', authenticate, getExpenseClaimDetail);
router.put('/:id', authenticate, updateExpenseClaim);
router.delete('/:id', authenticate, deleteExpenseClaim);

// 审批流
router.post('/:id/submit', authenticate, submitExpenseClaim);
router.post('/:id/approve', authenticate, approveExpenseClaim);
router.post('/:id/reject', authenticate, rejectExpenseClaim);
router.post('/:id/withdraw', authenticate, withdrawExpenseClaim);
router.post('/:id/reverse', authenticate, requireRole('manager', 'admin'), reverseExpenseClaim);

// 附件
router.post('/:id/attachments', authenticate, upload.single('file'), uploadAttachment);
router.delete('/:id/attachments/:attachId', authenticate, deleteAttachment);

export default router;
