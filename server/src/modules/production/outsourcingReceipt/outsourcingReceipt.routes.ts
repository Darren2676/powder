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

// 审核
router.post('/:id/approve', controller.approveReceipt);

export default router;
