import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getSalesPersons, getSalesPersonShippingReport, exportSalesPersonShippingReport } from './salesPersonShippingReport.controller';

const router = Router();

router.get('/sales-persons', authenticate, getSalesPersons);
router.get('/', authenticate, getSalesPersonShippingReport);
router.get('/export', authenticate, exportSalesPersonShippingReport);

export default router;
