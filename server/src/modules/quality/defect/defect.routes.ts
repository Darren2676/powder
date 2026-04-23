import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateDefect, validateUpdateDefect } from '../../../validators/quality.validator';
import { getDefects, createDefect, updateDefect, deleteDefect, exportDefects, importDefects, approveDefect, withdrawDefect } from './defect.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getDefects);
router.get('/export', authenticate, exportDefects);
router.post('/import', authenticate, upload.single('file'), importDefects);
router.post('/', authenticate, validateCreateDefect, createDefect);
router.put('/:id', authenticate, validateUpdateDefect, updateDefect);
router.put('/:id/approve', authenticate, approveDefect);
router.put('/:id/withdraw', authenticate, withdrawDefect);
router.delete('/:id', authenticate, deleteDefect);

export default router;
