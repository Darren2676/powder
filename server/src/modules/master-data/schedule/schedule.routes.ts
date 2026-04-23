import { Router } from 'express';
import multer from 'multer';
import { validateCreateSchedule, validateUpdateSchedule } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getSchedules, createSchedule, updateSchedule, deleteSchedule, exportSchedules, importSchedules, toggleScheduleStatus, approveSchedule, withdrawSchedule } from './schedule.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getSchedules);
router.get('/export', authenticate, exportSchedules);
router.post('/import', authenticate, upload.single('file'), importSchedules);
router.post('/', authenticate, validateCreateSchedule, createSchedule);
router.put('/:id', authenticate, validateUpdateSchedule, updateSchedule);
router.put('/:id/toggle-status', authenticate, toggleScheduleStatus);
router.put('/:id/approve', authenticate, approveSchedule);
router.put('/:id/withdraw', authenticate, withdrawSchedule);
router.delete('/:id', authenticate, deleteSchedule);

export default router;
