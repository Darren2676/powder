import { Router } from 'express';
import { validateGenerateAccountingPeriod, validateUpdateAccountingPeriod, validateUpdatePeriodDates } from '../../../validators/finance.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getAccountingPeriods,
  generatePeriods,
  openPeriod,
  closePeriod,
  updatePeriod,
  updatePeriodDates,
  deletePeriods,
  getAvailableYears
} from './accountingPeriod.controller';

const router = Router();

router.get('/', authenticate, getAccountingPeriods);
router.get('/years', authenticate, getAvailableYears);
router.post('/generate', authenticate, validateGenerateAccountingPeriod, generatePeriods);
router.put('/:id', authenticate, validateUpdateAccountingPeriod, updatePeriod);
router.put('/:id/dates', authenticate, validateUpdatePeriodDates, updatePeriodDates);
router.put('/:id/open', authenticate, openPeriod);
router.put('/:id/close', authenticate, closePeriod);
router.delete('/year/:fiscal_year', authenticate, deletePeriods);

export default router;
