// purchasing 域路由聚合
import { Router } from 'express';
import purchaseReqRoutes from './purchaseReq/purchaseReq.routes';
import purchaseOrderRoutes from './purchaseOrder/purchaseOrder.routes';
import purchaseCalcRoutes from './purchaseCalc/purchaseCalc.routes';
import purchasePriceRoutes from './purchasePrice/purchasePrice.routes';
import pieceRatePriceRoutes from './pieceRatePrice/pieceRatePrice.routes';

const router = Router();

router.use('/purchase-reqs', purchaseReqRoutes);
router.use('/purchase-orders', purchaseOrderRoutes);
router.use('/purchase-calc', purchaseCalcRoutes);
router.use('/purchase-prices', purchasePriceRoutes);
router.use('/piece-rate-prices', pieceRatePriceRoutes);

export default router;
