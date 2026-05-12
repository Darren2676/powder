import { Router } from 'express';
import orderRoutes from './orders/orders.routes';
import workReportRoutes from './workReports/workReports.routes';
import preparationRoutes from './preparations/preparations.routes';
import bomRoutes from './bom/bom.routes';

const router = Router();

router.use('/orders', orderRoutes);
router.use('/work-reports', workReportRoutes);
router.use('/material-preparations', preparationRoutes);
router.use('/bom', bomRoutes);

export default router;
