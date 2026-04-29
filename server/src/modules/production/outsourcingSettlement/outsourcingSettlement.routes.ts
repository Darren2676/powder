import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import * as controller from './outsourcingSettlement.controller';

const router = Router();

// 所有路由都需要认证
router.use(authenticate);

// 列表和详情
router.get('/', controller.getOutsourcingSettlements);
router.get('/:id', controller.getOutsourcingSettlementDetail);

// 创建
router.post('/', controller.createOutsourcingSettlement);

// 审核和付款
router.post('/:id/approve', controller.approveSettlement);
router.post('/:id/payment', controller.recordPayment);

// 导出
router.get('/export', controller.exportOutsourcingSettlements);

export default router;
