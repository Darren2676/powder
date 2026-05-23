// purchasing 域路由聚合
import { Router } from 'express';
import purchaseReqRoutes from './purchaseReq/purchaseReq.routes';
import purchaseOrderRoutes from './purchaseOrder/purchaseOrder.routes';
import purchaseCalcRoutes from './purchaseCalc/purchaseCalc.routes';
import purchasePriceRoutes from './purchasePrice/purchasePrice.routes';
import receivingNoticeRoutes from './receivingNotice/receivingNotice.routes';
import purchaseReturnRoutes from './purchaseReturn/purchaseReturn.routes';
import purchaseInvoiceRoutes from './purchaseInvoice/purchaseInvoice.routes';

const router = Router();

router.use('/purchase-reqs', purchaseReqRoutes);
router.use('/purchase-orders', purchaseOrderRoutes);
router.use('/purchase-calc', purchaseCalcRoutes);
router.use('/purchase-prices', purchasePriceRoutes);
router.use('/receiving-notices', receivingNoticeRoutes);
router.use('/purchase-returns', purchaseReturnRoutes);
router.use('/purchase-invoices', purchaseInvoiceRoutes);

export default router;
