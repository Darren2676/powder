import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { getTasks, createTask, updateTask, deleteTask, exportTasks, importTasks, importFromPlan } from '../controllers/task.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getTasks);
router.get('/export', authenticate, exportTasks);
router.post('/import', authenticate, upload.single('file'), importTasks);
router.post('/import-from-plan', authenticate, importFromPlan);
router.post('/', authenticate, createTask);
router.put('/:id', authenticate, updateTask);
router.delete('/:id', authenticate, deleteTask);

export default router;
