import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee, exportEmployees, importEmployees } from '../controllers/employee.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getEmployees);
router.get('/export', authenticate, exportEmployees);
router.post('/import', authenticate, upload.single('file'), importEmployees);
router.post('/', authenticate, createEmployee);
router.put('/:id', authenticate, updateEmployee);
router.delete('/:id', authenticate, deleteEmployee);

export default router;
