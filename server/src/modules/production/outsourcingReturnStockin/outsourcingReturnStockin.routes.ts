import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import * as controller from './outsourcingReturnStockin.controller';

const router = Router();

router.use(authenticate);

// 列表和详情
router.get('/', controller.getReturnStockins);
router.get('/:id', controller.getReturnStockinDetail);

// 确认入库
router.post('/:id/confirm', controller.confirmReturnStockin);

// 导出
router.get('/export', controller.exportReturnStockins);

export default router;
