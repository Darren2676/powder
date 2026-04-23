import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateMould, validateUpdateMould } from '../../../validators/equipment.validator';
import { getMoulds, createMould, updateMould, deleteMould, exportMoulds, importMoulds, approveMould, withdrawMould, updateMouldStrokes, updateMouldLifeSettings, scrapMould } from './mould.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getMoulds);
router.get('/export', authenticate, exportMoulds);
router.post('/import', authenticate, upload.single('file'), importMoulds);
router.post('/', authenticate, validateCreateMould, createMould);
router.put('/:id', authenticate, validateUpdateMould, updateMould);
router.delete('/:id', authenticate, deleteMould);
router.put('/:id/approve', authenticate, approveMould);
router.put('/:id/withdraw', authenticate, withdrawMould);
router.put('/:id/strokes', authenticate, updateMouldStrokes);
router.put('/:id/life-settings', authenticate, updateMouldLifeSettings);
router.put('/:id/scrap', authenticate, scrapMould);

export default router;
