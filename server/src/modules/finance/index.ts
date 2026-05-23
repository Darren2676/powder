// finance 域路由聚合
import { Router } from 'express';
import accountingPeriodRoutes from './accountingPeriod/accountingPeriod.routes';
import pieceRatePriceRoutes from './pieceRatePrice/pieceRatePrice.routes';
import standardCostRoutes from './standardCost/standardCost.routes';

const router = Router();

router.use('/accounting-periods', accountingPeriodRoutes);
router.use('/piece-rate-prices', pieceRatePriceRoutes);
router.use('/standard-costs', standardCostRoutes);

export default router;
