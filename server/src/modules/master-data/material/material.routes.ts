import { Router } from 'express';
import multer from 'multer';
import { validateCreateMaterial, validateUpdateMaterial } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getMaterials, createMaterial, updateMaterial, deleteMaterial, exportMaterials, importMaterials } from './material.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getMaterials);
router.get('/export', authenticate, exportMaterials);
router.post('/import', authenticate, upload.single('file'), importMaterials);
router.post('/', authenticate, validateCreateMaterial, createMaterial);
router.put('/:itemNumber', authenticate, validateUpdateMaterial, updateMaterial);
router.delete('/:itemNumber', authenticate, deleteMaterial);

export default router;
