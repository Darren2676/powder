import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getNonconformingProducts,
  getNonconformingProductDetail,
  handleNonconforming,
  cancelHandleNonconforming,
  exportNonconformingProducts
} from './nonconformingProduct.controller';

const router = Router();

router.use(authenticate);

// 列表查询
router.get('/', getNonconformingProducts);

// 导出
router.get('/export', exportNonconformingProducts);

// 详情
router.get('/:id', getNonconformingProductDetail);

// 不合格品处理
router.put('/:id/handle', handleNonconforming);

// 撤销不合格品处理
router.put('/:id/cancel-handle', cancelHandleNonconforming);

export default router;
