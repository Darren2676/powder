import { Router } from 'express';
import multer from 'multer';
import { validateCreateProcessTask, validateUpdateProcessTask } from '../../../validators/production.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getProcessTasks, createProcessTask, updateProcessTask, deleteProcessTask, batchDeleteProcessTasks, exportProcessTasks, importProcessTasks, generateFromOrder, getOrdersForGenerate, getTasksByOrder, getOrdersForReport } from './processTask.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getProcessTasks);
router.get('/export', authenticate, exportProcessTasks);
router.get('/orders-for-generate', authenticate, getOrdersForGenerate);
router.get('/orders-for-report', authenticate, getOrdersForReport);
router.get('/by-order/:orderNo', authenticate, getTasksByOrder);
router.post('/import', authenticate, upload.single('file'), importProcessTasks);
router.post('/generate-from-order', authenticate, generateFromOrder);
router.post('/batch-delete', authenticate, batchDeleteProcessTasks);
router.post('/', authenticate, validateCreateProcessTask, createProcessTask);
router.put('/:id', authenticate, validateUpdateProcessTask, updateProcessTask);
router.delete('/:id', authenticate, deleteProcessTask);

export default router;
