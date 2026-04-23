// quality 域路由聚合
import { Router } from 'express';
import defectRoutes from './defect/defect.routes';
import defectClassRoutes from './defectClass/defectClass.routes';
import defectReasonRoutes from './defectReason/defectReason.routes';
import qualityCharacteristicRoutes from './qualityCharacteristic/qualityCharacteristic.routes';
import qualityReportRoutes from './qualityReport/qualityReport.routes';
import inspectionSpecRoutes from './inspectionSpec/inspectionSpec.routes';
import incomingInspectSpecRoutes from './incomingInspectSpec/incomingInspectSpec.routes';
import inspectionPlanRoutes from './inspectionPlan/inspectionPlan.routes';
import incomingInspectPlanRoutes from './incomingInspectPlan/incomingInspectPlan.routes';
import productionInspectionRoutes from './productionInspection/productionInspection.routes';

const router = Router();

router.use('/defects', defectRoutes);
router.use('/defect-classes', defectClassRoutes);
router.use('/defect-reasons', defectReasonRoutes);
router.use('/quality-characteristics', qualityCharacteristicRoutes);
router.use('/quality-report', qualityReportRoutes);
router.use('/inspection-specs', inspectionSpecRoutes);
router.use('/incoming-inspect-specs', incomingInspectSpecRoutes);
router.use('/inspection-plans', inspectionPlanRoutes);
router.use('/incoming-inspect-plans', incomingInspectPlanRoutes);
router.use('/production-inspections', productionInspectionRoutes);

export default router;
