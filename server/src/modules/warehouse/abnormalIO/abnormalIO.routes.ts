import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateAbnormalIO, validateUpdateAbnormalIO } from '../../../validators/warehouse.validator';
import {
  getList,
  getDetail,
  create,
  update,
  remove,
  confirm,
  reject,
  withdraw
} from './abnormalIO.controller';

const router = Router();

// 列表查询
router.get('/', authenticate, getList);

// 详情
router.get('/:request_number', authenticate, getDetail);

// 创建
router.post('/', authenticate, validateCreateAbnormalIO, create);

// 更新
router.put('/:request_number', authenticate, validateUpdateAbnormalIO, update);

// 删除
router.delete('/:request_number', authenticate, remove);

// 确认（执行库存变更）
router.post('/:request_number/confirm', authenticate, confirm);

// 驳回
router.post('/:request_number/reject', authenticate, reject);

// 撤消确认（回退库存变更）
router.post('/:request_number/withdraw', authenticate, withdraw);

export default router;
