// warehouse 域路由聚合
import { Router } from 'express';
import materialWarehouseRoutes from './materialWarehouse/materialWarehouse.routes';
import finishedGoodsRoutes from './finishedGoods/finishedGoods.routes';
import stockInRoutes from './stockIn/stockIn.routes';
import stockCountRoutes from './stockCount/stockCount.routes';
import abnormalIORoutes from './abnormalIO/abnormalIO.routes';
import packingOrderRoutes from './packingOrder/packingOrder.routes';
import scrapDisposalRoutes from './scrapDisposal/scrapDisposal.routes';
import scrapTransactionRoutes from './scrapTransaction/scrapTransaction.routes';
import shelfLifeReportRoutes from './shelfLifeReport/shelfLifeReport.routes';

const router = Router();

router.use('/material-warehouse', materialWarehouseRoutes);
router.use('/finished-goods', finishedGoodsRoutes);
router.use('/stock-ins', stockInRoutes);
router.use('/stock-counts', stockCountRoutes);
router.use('/abnormal-io', abnormalIORoutes);
router.use('/packing-orders', packingOrderRoutes);
router.use('/scrap-disposal', scrapDisposalRoutes);
router.use('/scrap-transactions', scrapTransactionRoutes);
router.use('/shelf-life-report', shelfLifeReportRoutes);

export default router;
