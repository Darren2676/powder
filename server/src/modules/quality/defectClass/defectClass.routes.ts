import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateDefectClass, validateUpdateDefectClass } from '../../../validators/quality.validator';
import { getDefectClasses, createDefectClass, updateDefectClass, deleteDefectClass, exportDefectClasses, importDefectClasses, approveDefectClass, withdrawDefectClass } from './defectClass.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getDefectClasses);
router.get('/export', authenticate, exportDefectClasses);
router.post('/import', authenticate, upload.single('file'), importDefectClasses);
router.post('/', authenticate, validateCreateDefectClass, createDefectClass);
router.put('/:id', authenticate, validateUpdateDefectClass, updateDefectClass);
router.put('/:id/approve', authenticate, approveDefectClass);
router.put('/:id/withdraw', authenticate, withdrawDefectClass);
router.delete('/:id', authenticate, deleteDefectClass);

export default router;
