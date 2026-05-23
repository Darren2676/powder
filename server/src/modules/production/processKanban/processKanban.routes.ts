import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getKanbanOrders, getKanbanOrderFlow } from './processKanban.controller';

const router = Router();

router.get('/orders', authenticate, getKanbanOrders);
router.get('/order/:orderNo/flow', authenticate, getKanbanOrderFlow);

export default router;
