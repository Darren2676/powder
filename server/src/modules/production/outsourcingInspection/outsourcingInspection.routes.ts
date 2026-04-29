import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import * as controller from './outsourcingInspection.controller';

const router = Router();

// 所有路由都需要认证
router.use(authenticate);

// 列表和详情
router.get('/', controller.getOutsourcingInspections);
router.get('/:id', controller.getOutsourcingInspectionDetail);

// 创建和更新
router.post('/', controller.createOutsourcingInspection);
router.put('/:id', controller.updateInspectionResult);

// 完成质检
router.post('/:id/complete', controller.completeInspection);

// 导出
router.get('/export', controller.exportOutsourcingInspections);

export default router;
