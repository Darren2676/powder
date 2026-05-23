import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getScrapQualityStatsKPI, getScrapQualityStatsChartData, getScrapQualityStatsTableData } from './scrapQualityStatsReport.controller';

const router = Router();

router.get('/kpi', authenticate, getScrapQualityStatsKPI);
router.get('/chart-data', authenticate, getScrapQualityStatsChartData);
router.get('/table-data', authenticate, getScrapQualityStatsTableData);

export default router;
