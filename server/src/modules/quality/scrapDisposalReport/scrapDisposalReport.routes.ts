import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getScrapDisposalKPI, getScrapDisposalChartData, getScrapDisposalTableData } from './scrapDisposalReport.controller';

const router = Router();

router.get('/kpi', authenticate, getScrapDisposalKPI);
router.get('/chart-data', authenticate, getScrapDisposalChartData);
router.get('/table-data', authenticate, getScrapDisposalTableData);

export default router;
