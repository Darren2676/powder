import { Router } from 'express';
import { apiKeyAuth } from '../../../middleware/apiKeyAuth.middleware';
import { requirePermission } from '../../../middleware/apiKeyPermission.middleware';
import { openGetPreparations, openGetPreparationDetails, openGetPreparationDetailsGrouped, openGenerateByProcess } from './preparations.controller';

const router = Router();

router.get('/', apiKeyAuth, requirePermission('prep', 'read'), openGetPreparations);
router.get('/:id/details', apiKeyAuth, requirePermission('prep', 'read'), openGetPreparationDetails);
router.get('/:id/details-grouped', apiKeyAuth, requirePermission('prep', 'read'), openGetPreparationDetailsGrouped);
router.post('/generate-by-process', apiKeyAuth, requirePermission('prep', 'write'), openGenerateByProcess);

export default router;
