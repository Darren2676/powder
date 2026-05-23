import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getScrapInboundOrders,
  getScrapInboundOrderDetail,
  createScrapInboundOrder,
  deleteScrapInboundOrder
} from './scrapInboundOrder.controller';

const router = Router();

// 报废入库单管理路由
router.get('/', authenticate, getScrapInboundOrders);
router.get('/:stock_in_number', authenticate, getScrapInboundOrderDetail);
router.post('/', authenticate, createScrapInboundOrder);
router.delete('/:stock_in_number', authenticate, deleteScrapInboundOrder);

export default router;
