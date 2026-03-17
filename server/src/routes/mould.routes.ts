import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { getMoulds, createMould, updateMould, deleteMould, exportMoulds, importMoulds } from '../controllers/mould.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getMoulds);
router.get('/export', authenticate, exportMoulds);
router.post('/import', authenticate, upload.single('file'), importMoulds);
router.post('/', authenticate, createMould);
router.put('/:id', authenticate, updateMould);
router.delete('/:id', authenticate, deleteMould);

export default router;
