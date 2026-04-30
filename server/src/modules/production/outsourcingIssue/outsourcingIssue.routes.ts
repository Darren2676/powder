import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import * as controller from './outsourcingIssue.controller';

const router = Router();

// 所有路由都需要认证
router.use(authenticate);

// 列表和详情
router.get('/', controller.getOutsourcingIssues);
router.get('/:id', controller.getOutsourcingIssueDetail);

// CRUD操作
router.post('/', controller.createOutsourcingIssue);
router.put('/:id', controller.updateOutsourcingIssue);
router.delete('/:id', controller.deleteOutsourcingIssue);

// 审核和确认
router.post('/:id/approve', controller.approveIssue);
router.post('/:id/confirm', controller.confirmIssue);

// 追加发料（分批发料）
router.post('/append', controller.appendIssue);

// 导出
router.get('/export', controller.exportOutsourcingIssues);

export default router;
