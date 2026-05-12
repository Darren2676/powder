import { Router } from 'express';
import { apiKeyAuth } from '../../../middleware/apiKeyAuth.middleware';
import { requirePermission } from '../../../middleware/apiKeyPermission.middleware';
import { openGetWorkReports, openGetWorkReportDetail, openCreateWorkReport } from './workReports.controller';

const router = Router();

router.get('/', apiKeyAuth, requirePermission('work_report', 'read'), openGetWorkReports);
router.get('/:id', apiKeyAuth, requirePermission('work_report', 'read'), openGetWorkReportDetail);
router.post('/', apiKeyAuth, requirePermission('work_report', 'write'), openCreateWorkReport);

export default router;
