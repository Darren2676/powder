import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getScrapOrderKPI, getScrapOrderChartData, getScrapOrderTableData } from './scrapOrderReport.controller';

const router = Router();

router.get('/kpi', authenticate, getScrapOrderKPI);
router.get('/chart-data', authenticate, getScrapOrderChartData);
router.get('/table-data', authenticate, getScrapOrderTableData);

export default router;
