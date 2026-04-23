import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateForecast, validateUpdateForecast } from '../../../validators/sales.validator';
import { getForecasts, getForecastDetail, createForecast, updateForecast, deleteForecast, getForecastConsumptionLog, getForecastDetailsPage, exportForecastDetailsSelected, addForecastDetail, updateForecastDetail, deleteForecastDetail } from './forecast.controller';

const router = Router();

router.get('/', authenticate, getForecasts);
router.get('/details-page', authenticate, getForecastDetailsPage);
router.post('/details-page/export-selected', authenticate, exportForecastDetailsSelected);
router.post('/', authenticate, validateCreateForecast, createForecast);
router.get('/:id', authenticate, getForecastDetail);
router.put('/:id', authenticate, validateUpdateForecast, updateForecast);
router.delete('/:id', authenticate, deleteForecast);
router.get('/:id/consumption', authenticate, getForecastConsumptionLog);
router.post('/:id/details', authenticate, addForecastDetail);
router.put('/details/:detailId', authenticate, updateForecastDetail);
router.delete('/details/:detailId', authenticate, deleteForecastDetail);

export default router;
