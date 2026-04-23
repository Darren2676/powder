import { Router } from 'express';
import { validatePurchaseCalcDemand, validateGeneratePurchaseReq } from '../../../validators/purchasing.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { demandReport, generatePurchaseReq } from './purchaseCalc.controller';

const router = Router();

router.post('/demand-report', authenticate, validatePurchaseCalcDemand, demandReport);
router.post('/generate-purchase-req', authenticate, validateGeneratePurchaseReq, generatePurchaseReq);

export default router;
