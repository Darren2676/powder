import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getScrapOrders,
  getScrapOrderDetail,
  exportScrapOrders
} from './scrapOrder.controller';

const router = Router();

router.use(authenticate);

// 列表查询
router.get('/', getScrapOrders);

// 导出
router.get('/export', exportScrapOrders);

// 详情
router.get('/:stockInNumber', getScrapOrderDetail);

export default router;
