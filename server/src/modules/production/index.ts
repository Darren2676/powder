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
import outsourcingReturnStockinRoutes from './outsourcingReturnStockin/outsourcingReturnStockin.routes';
import outsourcingPriceRoutes from './outsourcingPrice/outsourcingPrice.routes';
import wipReportRoutes from './wipReport/wipReport.routes';
import progressDashboardRoutes from './progressDashboard/progressDashboard.routes';
import backflushTaskRoutes from './backflushTask/backflushTask.routes';
import pieceRateWageRoutes from './pieceRateWage/pieceRateWage.routes';
import materialCostRoutes from './materialCost/materialCost.routes';
import materialReturnRoutes from './materialReturn/materialReturn.routes';
import processKanbanRoutes from './processKanban/processKanban.routes';
import * as mobileLabelController from './outsourcingIssue/outsourcingIssue.mobile.controller';
import outsourcingInspectionMobileRoutes from './outsourcingInspection/outsourcingInspection.mobile.routes';

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
router.use('/outsourcing/return-stockin', outsourcingReturnStockinRoutes);
router.use('/outsourcing-prices', outsourcingPriceRoutes);
router.use('/wip', wipReportRoutes);
router.use('/progress-dashboard', progressDashboardRoutes);
router.use('/backflush-tasks', backflushTaskRoutes);
router.use('/piece-rate-wages', pieceRateWageRoutes);
router.use('/production-material-cost', materialCostRoutes);
router.use('/material-returns', materialReturnRoutes);
router.use('/process-kanban', processKanbanRoutes);

// 移动端委外路由
router.use('/mobile/outsourcing/issue', outsourcingIssueMobileRoutes);
router.use('/mobile/outsourcing/receipt', outsourcingReceiptMobileRoutes);

// 移动端通用工具路由
router.post('/mobile/outsourcing/print-label', mobileLabelController.printLabel);
router.post('/mobile/outsourcing/upload-photos', mobileLabelController.uploadPhotos);

// 移动端质检路由
router.use('/mobile/inspection', outsourcingInspectionMobileRoutes);

export default router;
