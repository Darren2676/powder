import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getKPI,
  getMonthlyTrend,
  getCustomerRanking,
  getProductRanking,
  getReturnReasonDistribution,
  getOrderSummary
} from './salesReport.controller';

const router = Router();

router.get('/kpi', authenticate, getKPI);
router.get('/monthly-trend', authenticate, getMonthlyTrend);
router.get('/customer-ranking', authenticate, getCustomerRanking);
router.get('/product-ranking', authenticate, getProductRanking);
router.get('/return-reason', authenticate, getReturnReasonDistribution);
router.get('/order-summary', authenticate, getOrderSummary);

export default router;
