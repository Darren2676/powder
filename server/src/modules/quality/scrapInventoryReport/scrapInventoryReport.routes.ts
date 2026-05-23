import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getScrapInventoryKPI, getScrapInventoryChartData, getScrapInventoryTableData } from './scrapInventoryReport.controller';

const router = Router();

router.get('/kpi', authenticate, getScrapInventoryKPI);
router.get('/chart-data', authenticate, getScrapInventoryChartData);
router.get('/table-data', authenticate, getScrapInventoryTableData);

export default router;
