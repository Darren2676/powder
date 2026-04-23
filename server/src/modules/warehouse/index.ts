// warehouse 域路由聚合
import { Router } from 'express';
import materialWarehouseRoutes from './materialWarehouse/materialWarehouse.routes';
import finishedGoodsRoutes from './finishedGoods/finishedGoods.routes';
import stockInRoutes from './stockIn/stockIn.routes';
import stockCountRoutes from './stockCount/stockCount.routes';
import abnormalIORoutes from './abnormalIO/abnormalIO.routes';

const router = Router();

router.use('/material-warehouse', materialWarehouseRoutes);
router.use('/finished-goods', finishedGoodsRoutes);
router.use('/stock-ins', stockInRoutes);
router.use('/stock-counts', stockCountRoutes);
router.use('/abnormal-io', abnormalIORoutes);

export default router;
