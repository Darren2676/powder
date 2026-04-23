// finance 域路由聚合
import { Router } from 'express';
import accountingPeriodRoutes from './accountingPeriod/accountingPeriod.routes';

const router = Router();

router.use('/accounting-periods', accountingPeriodRoutes);

export default router;
