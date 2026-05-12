import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireRole } from '../../../middleware/role.middleware';
import {
  getApiKeys, createApiKey, updateApiKey, deleteApiKey,
  regenerateApiKey, getApiKeyUsage, getApiKeyStats
} from './apiKey.controller';

const router = Router();

router.get('/', authenticate, requireRole('admin'), getApiKeys);
router.post('/', authenticate, requireRole('admin'), createApiKey);
router.put('/:id', authenticate, requireRole('admin'), updateApiKey);
router.delete('/:id', authenticate, requireRole('admin'), deleteApiKey);
router.post('/:id/regenerate', authenticate, requireRole('admin'), regenerateApiKey);
router.get('/:id/usage', authenticate, requireRole('admin'), getApiKeyUsage);
router.get('/:id/stats', authenticate, requireRole('admin'), getApiKeyStats);

export default router;
