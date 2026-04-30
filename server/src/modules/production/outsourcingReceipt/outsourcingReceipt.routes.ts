import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import * as controller from './outsourcingReceipt.controller';

const router = Router();

// 所有路由都需要认证
router.use(authenticate);

// 列表和详情
router.get('/', controller.getOutsourcingReceipts);
router.get('/:id', controller.getOutsourcingReceiptDetail);

// 创建
router.post('/', controller.createOutsourcingReceipt);

// 确认收回（入待检仓+自动创建质检单）
router.post('/:id/confirm', controller.confirmReceipt);

// 追加回收（分批回收）
router.post('/append', controller.appendReceipt);

export default router;
