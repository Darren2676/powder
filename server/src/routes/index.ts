import { Router } from 'express';

// ── 按业务域导入（所有域已迁移到 modules/）──
import masterDataRoutes from '../modules/master-data';
import systemRoutes from '../modules/system';
import salesRoutes from '../modules/sales';
import planningRoutes from '../modules/planning';
import productionRoutes from '../modules/production';
import warehouseRoutes from '../modules/warehouse';
import purchasingRoutes from '../modules/purchasing';
import qualityRoutes from '../modules/quality';
import financeRoutes from '../modules/finance';
import integrationRoutes from '../modules/integration';
import equipmentRoutes from '../modules/equipment';

const router = Router();

router.use(masterDataRoutes);
router.use(systemRoutes);
router.use(salesRoutes);
router.use(planningRoutes);
router.use(productionRoutes);
router.use(warehouseRoutes);
router.use(purchasingRoutes);
router.use(qualityRoutes);
router.use(financeRoutes);
router.use(integrationRoutes);
router.use(equipmentRoutes);

export default router;
