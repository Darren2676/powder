// integration 域路由聚合
import { Router } from 'express';
import batchTraceRoutes from './batchTrace/batchTrace.routes';

const router = Router();

router.use('/batch-trace', batchTraceRoutes);

export default router;
