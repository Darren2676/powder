import { Router } from 'express';
import multer from 'multer';
import { validateCreateEmployee, validateUpdateEmployee } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee, exportEmployees, importEmployees, approveEmployee, withdrawEmployee, enableEmployee, disableEmployee } from './employee.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getEmployees);
router.get('/export', authenticate, exportEmployees);
router.post('/import', authenticate, upload.single('file'), importEmployees);
router.post('/', authenticate, validateCreateEmployee, createEmployee);
router.put('/:id', authenticate, validateUpdateEmployee, updateEmployee);
router.put('/:id/approve', authenticate, approveEmployee);
router.put('/:id/withdraw', authenticate, withdrawEmployee);
router.put('/:id/enable', authenticate, enableEmployee);
router.put('/:id/disable', authenticate, disableEmployee);
router.delete('/:id', authenticate, deleteEmployee);

export default router;
