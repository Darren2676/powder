import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateOrder } from '../../../validators/order.validator';
import { getOrders, createOrder, updateOrder, deleteOrder, exportOrders, importOrders, importFromPlan, getOrderOverview, splitOrders, dispatchOrders, getGanttData, getPrintData, dispatchAndGenerate, dispatchPrecheck, updateGanttTask } from './order.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getOrders);
router.get('/export', authenticate, exportOrders);
router.get('/gantt', authenticate, getGanttData);
router.put('/:id/gantt-drag', authenticate, updateGanttTask);
router.post('/import', authenticate, upload.single('file'), importOrders);
router.post('/import-from-plan', authenticate, importFromPlan);
router.post('/split', authenticate, splitOrders);
router.post('/dispatch', authenticate, dispatchOrders);
router.post('/dispatch-and-generate', authenticate, dispatchAndGenerate);
router.post('/dispatch-precheck', authenticate, dispatchPrecheck);
router.post('/print-data', authenticate, getPrintData);
router.get('/:id/overview', authenticate, getOrderOverview);
router.post('/', authenticate, validateCreateOrder, createOrder);
router.put('/:id', authenticate, updateOrder);
router.delete('/:id', authenticate, deleteOrder);

export default router;
