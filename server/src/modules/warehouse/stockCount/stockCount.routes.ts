import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getList,
  getDetail,
  snapshotPreview,
  create,
  update,
  remove,
  submitReview,
  review,
  confirm,
  cancel,
  reportSummary,
  reportDiffDetail,
  reportTrend
} from './stockCount.controller';
import { validateCreateStockCount, validateUpdateStockCount } from '../../../validators/warehouse.validator';

const router = Router();

// 报表接口（放在参数路由前面避免冲突）
router.get('/report/summary', authenticate, reportSummary);
router.get('/report/diff-detail', authenticate, reportDiffDetail);
router.get('/report/trend', authenticate, reportTrend);
router.get('/snapshot-preview', authenticate, snapshotPreview);

// 列表查询
router.get('/', authenticate, getList);

// 详情
router.get('/:count_number', authenticate, getDetail);

// 创建
router.post('/', authenticate, validateCreateStockCount, create);

// 更新盘点明细
router.put('/:count_number', authenticate, validateUpdateStockCount, update);

// 删除
router.delete('/:count_number', authenticate, remove);

// 提交复核
router.post('/:count_number/submit-review', authenticate, submitReview);

// 复核
router.post('/:count_number/review', authenticate, review);

// 确认执行
router.post('/:count_number/confirm', authenticate, confirm);

// 作废
router.post('/:count_number/cancel', authenticate, cancel);

export default router;
