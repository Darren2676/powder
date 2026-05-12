import { Router } from 'express';
import { apiKeyAuth } from '../../../middleware/apiKeyAuth.middleware';
import { requirePermission } from '../../../middleware/apiKeyPermission.middleware';
import { openGetBomHeaders, openGetBomDetail, openGetBomTree, openGetBomFlatten } from './bom.controller';

const router = Router();

router.get('/', apiKeyAuth, requirePermission('bom', 'read'), openGetBomHeaders);
router.get('/:id', apiKeyAuth, requirePermission('bom', 'read'), openGetBomDetail);
router.get('/:id/tree', apiKeyAuth, requirePermission('bom', 'read'), openGetBomTree);
router.get('/:id/flatten', apiKeyAuth, requirePermission('bom', 'read'), openGetBomFlatten);

export default router;
