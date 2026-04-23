import { Router } from 'express';
import multer from 'multer';
import { validateCreateDefectReason, validateUpdateDefectReason } from '../../../validators/quality.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getDefectReasons, createDefectReason, updateDefectReason, deleteDefectReason, exportDefectReasons, importDefectReasons, approveDefectReason, withdrawDefectReason } from './defectReason.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getDefectReasons);
router.get('/export', authenticate, exportDefectReasons);
router.post('/import', authenticate, upload.single('file'), importDefectReasons);
router.post('/', authenticate, validateCreateDefectReason, createDefectReason);
router.put('/:id', authenticate, validateUpdateDefectReason, updateDefectReason);
router.put('/:id/approve', authenticate, approveDefectReason);
router.put('/:id/withdraw', authenticate, withdrawDefectReason);
router.delete('/:id', authenticate, deleteDefectReason);

export default router;
