import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getScrapInventory,
  getScrapBatchDetail,
  getScrapDisposalList,
  getScrapDisposalDetail,
  createScrapDisposal,
  confirmScrapDisposal,
  rejectScrapDisposal,
  deleteScrapDisposal
} from './scrapDisposal.controller';
import {
  getCompletedScrapStockCounts, getScrapMonthlyReport
} from './scrapMonthlyReport.controller';

const router = Router();

// 报废仓库存查询
router.get('/inventory', authenticate, getScrapInventory);

// 报废仓批次明细
router.get('/inventory/:item_number/batches', authenticate, getScrapBatchDetail);

// 处置单列表
router.get('/disposals', authenticate, getScrapDisposalList);

// 处置单详情
router.get('/disposals/:disposal_number', authenticate, getScrapDisposalDetail);

// 创建处置申请
router.post('/disposals', authenticate, createScrapDisposal);

// 确认处置（执行出库）
router.post('/disposals/:disposal_number/confirm', authenticate, confirmScrapDisposal);

// 驳回处置
router.post('/disposals/:disposal_number/reject', authenticate, rejectScrapDisposal);

// 删除处置
router.delete('/disposals/:disposal_number', authenticate, deleteScrapDisposal);

// 报废仓月度报表
router.get('/completed-scrap-stock-counts', authenticate, getCompletedScrapStockCounts);
router.get('/scrap-monthly-report', authenticate, getScrapMonthlyReport);

export default router;
