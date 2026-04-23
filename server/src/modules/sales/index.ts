// sales 域路由聚合
import { Router } from 'express';
import salesOrderRoutes from './salesOrder/salesOrder.routes';
import salesPriceRoutes from './salesPrice/salesPrice.routes';
import forecastRoutes from './forecast/forecast.routes';
import salesReportRoutes from './salesReport/salesReport.routes';
import shippingRequestRoutes from './shippingRequest/shippingRequest.routes';
import shippingOrderRoutes from './shippingOrder/shippingOrder.routes';
import returnOrderRoutes from './returnOrder/returnOrder.routes';

const router = Router();

router.use('/sales-orders', salesOrderRoutes);
router.use('/sales-prices', salesPriceRoutes);
router.use('/forecasts', forecastRoutes);
router.use('/sales-report', salesReportRoutes);
router.use('/shipping-requests', shippingRequestRoutes);
router.use('/shipping-orders', shippingOrderRoutes);
router.use('/return-orders', returnOrderRoutes);

export default router;
