import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateQualityCharacteristic, validateUpdateQualityCharacteristic } from '../../../validators/quality.validator';
import { getQualityCharacteristics, createQualityCharacteristic, updateQualityCharacteristic, deleteQualityCharacteristic, exportQualityCharacteristics, importQualityCharacteristics, approveQualityCharacteristic, withdrawQualityCharacteristic } from './qualityCharacteristic.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getQualityCharacteristics);
router.get('/export', authenticate, exportQualityCharacteristics);
router.post('/import', authenticate, upload.single('file'), importQualityCharacteristics);
router.post('/', authenticate, validateCreateQualityCharacteristic, createQualityCharacteristic);
router.put('/:id', authenticate, validateUpdateQualityCharacteristic, updateQualityCharacteristic);
router.put('/:id/approve', authenticate, approveQualityCharacteristic);
router.put('/:id/withdraw', authenticate, withdrawQualityCharacteristic);
router.delete('/:id', authenticate, deleteQualityCharacteristic);

export default router;
