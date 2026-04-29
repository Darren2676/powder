// production 域路由聚合
import { Router } from 'express';
import orderRoutes from './order/order.routes';
import processTaskRoutes from './processTask/processTask.routes';
import workReportRoutes from './workReport/workReport.routes';
import materialPreparationRoutes from './materialPreparation/materialPreparation.routes';
import materialIssueRoutes from './materialIssue/materialIssue.routes';
import outsourcingReqRoutes from './outsourcingReq/outsourcingReq.routes';
import outsourcingOrderRoutes from './outsourcingOrder/outsourcingOrder.routes';
import outsourcingIssueRoutes from './outsourcingIssue/outsourcingIssue.routes';
import outsourcingIssueMobileRoutes from './outsourcingIssue/outsourcingIssue.mobile.routes';
import outsourcingReceiptRoutes from './outsourcingReceipt/outsourcingReceipt.routes';
import outsourcingReceiptMobileRoutes from './outsourcingReceipt/outsourcingReceipt.mobile.routes';
import outsourcingInspectionRoutes from './outsourcingInspection/outsourcingInspection.routes';
import outsourcingSettlementRoutes from './outsourcingSettlement/outsourcingSettlement.routes';
import wipReportRoutes from './wipReport/wipReport.routes';

const router = Router();

router.use('/orders', orderRoutes);
router.use('/process-tasks', processTaskRoutes);
router.use('/work-reports', workReportRoutes);
router.use('/material-preparations', materialPreparationRoutes);
router.use('/material-issues', materialIssueRoutes);
router.use('/outsourcing-reqs', outsourcingReqRoutes);
router.use('/outsourcing-orders', outsourcingOrderRoutes);
router.use('/outsourcing/issue', outsourcingIssueRoutes);
router.use('/outsourcing/receipt', outsourcingReceiptRoutes);
router.use('/outsourcing/inspection', outsourcingInspectionRoutes);
router.use('/outsourcing/settlement', outsourcingSettlementRoutes);
router.use('/wip', wipReportRoutes);

// 移动端委外路由
router.use('/mobile/outsourcing/issue', outsourcingIssueMobileRoutes);
router.use('/mobile/outsourcing/receipt', outsourcingReceiptMobileRoutes);

export default router;
