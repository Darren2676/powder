// planning 域路由聚合
import { Router } from 'express';
import planRoutes from './plan/plan.routes';
import mpsRoutes from './mps/mps.routes';
import mrpRoutes from './mrp/mrp.routes';
import planMaterialCostRoutes from './planMaterialCost/planMaterialCost.routes';

const router = Router();

router.use('/plans', planRoutes);
router.use('/mps', mpsRoutes);
router.use('/mrp', mrpRoutes);
router.use('/plan-material-cost', planMaterialCostRoutes);

export default router;
