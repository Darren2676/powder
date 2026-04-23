// integration 域路由聚合
import { Router } from 'express';
import xinheyunInspectRoutes from './xinheyunInspect/xinheyunInspect.routes';
import xinheyunInventoryRoutes from './xinheyunInventory/xinheyunInventory.routes';
import batchTraceRoutes from './batchTrace/batchTrace.routes';

const router = Router();

router.use('/xhy-inspect', xinheyunInspectRoutes);
router.use('/xhy-inventory', xinheyunInventoryRoutes);
router.use('/batch-trace', batchTraceRoutes);

export default router;
