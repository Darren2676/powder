import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { calculateMPS, importToPlan, getSalesOrdersForMpsImport } from './mps.controller';

const router = Router();

router.get('/sales-orders-for-import', authenticate, getSalesOrdersForMpsImport);
router.get('/calculate', authenticate, calculateMPS);
router.post('/import-to-plan', authenticate, importToPlan);

export default router;
