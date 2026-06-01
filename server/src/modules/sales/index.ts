// sales 域路由聚合
import { Router } from 'express';
import salesOrderRoutes from './salesOrder/salesOrder.routes';
import salesPriceRoutes from './salesPrice/salesPrice.routes';
import forecastRoutes from './forecast/forecast.routes';
import salesReportRoutes from './salesReport/salesReport.routes';
import shippingRequestRoutes from './shippingRequest/shippingRequest.routes';
import shippingOrderRoutes from './shippingOrder/shippingOrder.routes';
import returnOrderRoutes from './returnOrder/returnOrder.routes';
import salesInvoiceRoutes from './salesInvoice/salesInvoice.routes';
import sampleRequestRoutes from './sampleRequest/sampleRequest.routes';
import salesPersonShippingReportRoutes from './salesPersonShippingReport/salesPersonShippingReport.routes';

const router = Router();

router.use('/sales-orders', salesOrderRoutes);
router.use('/sales-prices', salesPriceRoutes);
router.use('/forecasts', forecastRoutes);
router.use('/sales-report', salesReportRoutes);
router.use('/shipping-requests', shippingRequestRoutes);
router.use('/shipping-orders', shippingOrderRoutes);
router.use('/return-orders', returnOrderRoutes);
router.use('/sales-invoices', salesInvoiceRoutes);
router.use('/sample-requests', sampleRequestRoutes);
router.use('/sales-person-shipping-report', salesPersonShippingReportRoutes);

export default router;
