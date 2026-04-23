import { Router } from 'express';
import multer from 'multer';
import { validateCreateWorkReport, validateUpdateWorkReport } from '../../../validators/production.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getWorkReports, createWorkReport, updateWorkReport, deleteWorkReport, exportWorkReports, importWorkReports, getTasksForReport, quickReport, completeOrderReport } from './workReport.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getWorkReports);
router.get('/export', authenticate, exportWorkReports);
router.get('/tasks-for-report', authenticate, getTasksForReport);
router.post('/import', authenticate, upload.single('file'), importWorkReports);
router.post('/quick', authenticate, quickReport);
router.post('/complete-order', authenticate, completeOrderReport);
router.post('/', authenticate, validateCreateWorkReport, createWorkReport);
router.put('/:id', authenticate, validateUpdateWorkReport, updateWorkReport);
router.delete('/:id', authenticate, deleteWorkReport);

export default router;
