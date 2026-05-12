import { Router } from 'express';
import {
  getAllDocumentCompletionConfigs,
  getDocumentCompletionConfigByType,
  updateDocumentCompletionConfig,
  resetDocumentCompletionConfig,
} from './documentCompletionConfig.controller';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireRole } from '../../../middleware/role.middleware';

const router = Router();

router.get('/', authenticate, requireRole('admin'), getAllDocumentCompletionConfigs);
router.get('/:type', authenticate, requireRole('admin'), getDocumentCompletionConfigByType);
router.put('/:type', authenticate, requireRole('admin'), updateDocumentCompletionConfig);
router.put('/:type/reset', authenticate, requireRole('admin'), resetDocumentCompletionConfig);

export default router;
