import { Router } from 'express';
import { validateUpdateUserPreference } from '../../../validators/system.validator';
import { getPreference, savePreference } from './userPreference.controller';
import { authenticate } from '../../../middleware/auth.middleware';

const router = Router();

router.get('/:pageKey', authenticate, getPreference);
router.put('/:pageKey', authenticate, validateUpdateUserPreference, savePreference);

export default router;
