import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getReceivingNotices, getReceivingNoticeDetail, createReceivingNotice,
  deleteReceivingNotice, confirmReceivingNotice
} from './receivingNotice.controller';

const router = Router();

router.get('/', authenticate, getReceivingNotices);
router.get('/:id', authenticate, getReceivingNoticeDetail);
router.post('/', authenticate, createReceivingNotice);
router.delete('/:id', authenticate, deleteReceivingNotice);
router.post('/:id/confirm', authenticate, confirmReceivingNotice);

export default router;
