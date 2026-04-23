import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  forwardTrace,
  reverseTrace,
  searchBatch,
  getBatchDetail,
  traceByProductionOrder
} from './batchTrace.controller';

const router = Router();

// 正向追溯：成品批次 → 原材料
router.get('/forward', authenticate, forwardTrace);

// 反向追溯：原材料批次 → 成品
router.get('/reverse', authenticate, reverseTrace);

// 批次搜索
router.get('/search', authenticate, searchBatch);

// 批次详情
router.get('/detail', authenticate, getBatchDetail);

// 按生产单追溯
router.get('/production-order', authenticate, traceByProductionOrder);

export default router;
