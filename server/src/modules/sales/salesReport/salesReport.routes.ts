import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getKPI,
  getMonthlyTrend,
  getCustomerRanking,
  getProductRanking,
  getReturnReasonDistribution,
  getOrderSummary,
  getShippingWarning,
  getShippingByOrderSummary,
  exportShippingByOrderSummary,
  getOrderProductionSummary
} from './salesReport.controller';

const router = Router();

router.get('/kpi', authenticate, getKPI);
router.get('/monthly-trend', authenticate, getMonthlyTrend);
router.get('/customer-ranking', authenticate, getCustomerRanking);
router.get('/product-ranking', authenticate, getProductRanking);
router.get('/return-reason', authenticate, getReturnReasonDistribution);
router.get('/order-summary', authenticate, getOrderSummary);
router.get('/shipping-warning', authenticate, getShippingWarning);
router.get('/shipping-by-order-summary', authenticate, getShippingByOrderSummary);
router.get('/shipping-by-order-summary/export', authenticate, exportShippingByOrderSummary);
router.get('/order-production-summary', authenticate, getOrderProductionSummary);

export default router;
