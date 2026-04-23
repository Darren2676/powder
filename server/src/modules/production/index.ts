// production 域路由聚合
import { Router } from 'express';
import orderRoutes from './order/order.routes';
import processTaskRoutes from './processTask/processTask.routes';
import workReportRoutes from './workReport/workReport.routes';
import materialPreparationRoutes from './materialPreparation/materialPreparation.routes';
import materialIssueRoutes from './materialIssue/materialIssue.routes';
import outsourcingReqRoutes from './outsourcingReq/outsourcingReq.routes';
import outsourcingOrderRoutes from './outsourcingOrder/outsourcingOrder.routes';
import wipReportRoutes from './wipReport/wipReport.routes';

const router = Router();

router.use('/orders', orderRoutes);
router.use('/process-tasks', processTaskRoutes);
router.use('/work-reports', workReportRoutes);
router.use('/material-preparations', materialPreparationRoutes);
router.use('/material-issues', materialIssueRoutes);
router.use('/outsourcing-reqs', outsourcingReqRoutes);
router.use('/outsourcing-orders', outsourcingOrderRoutes);
router.use('/wip', wipReportRoutes);

export default router;
