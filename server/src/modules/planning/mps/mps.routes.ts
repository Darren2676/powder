import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { calculateMPS, importToPlan, getSalesOrdersForMpsImport, getDemandSources, importFromDemandSources } from './mps.controller';

const router = Router();

router.get('/sales-orders-for-import', authenticate, getSalesOrdersForMpsImport);
router.get('/calculate', authenticate, calculateMPS);
router.post('/import-to-plan', authenticate, importToPlan);
router.get('/demand-sources', authenticate, getDemandSources);
router.post('/import-from-demand-sources', authenticate, importFromDemandSources);

export default router;
