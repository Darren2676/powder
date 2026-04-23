import { Router } from 'express';
import multer from 'multer';
import { validateCreatePlan, validateUpdatePlan } from '../../../validators/planning.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getPlans, createPlan, updatePlan, deletePlan, exportPlans, importPlans, getSalesOrdersForImport, importFromSalesOrder, getForecastsForImport, importFromForecast } from './plan.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getPlans);
router.get('/export', authenticate, exportPlans);
router.get('/sales-orders-for-import', authenticate, getSalesOrdersForImport);
router.post('/import', authenticate, upload.single('file'), importPlans);
router.post('/import-from-sales-order', authenticate, importFromSalesOrder);
router.get('/forecasts-for-import', authenticate, getForecastsForImport);
router.post('/import-from-forecast', authenticate, importFromForecast);
router.post('/', authenticate, validateCreatePlan, createPlan);
router.put('/:id', authenticate, validateUpdatePlan, updatePlan);
router.delete('/:id', authenticate, deletePlan);

export default router;
