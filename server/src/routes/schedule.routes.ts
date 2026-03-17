import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { getSchedules, createSchedule, updateSchedule, deleteSchedule, exportSchedules, importSchedules } from '../controllers/schedule.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getSchedules);
router.get('/export', authenticate, exportSchedules);
router.post('/import', authenticate, upload.single('file'), importSchedules);
router.post('/', authenticate, createSchedule);
router.put('/:id', authenticate, updateSchedule);
router.delete('/:id', authenticate, deleteSchedule);

export default router;
