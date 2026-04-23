import { Router } from 'express';
import multer from 'multer';
import { validateCreateMaterialPreparation, validateUpdateMaterialPreparation } from '../../../validators/production.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getMaterialPreparations, createMaterialPreparation, updateMaterialPreparation, deleteMaterialPreparation, exportMaterialPreparations, importMaterialPreparations, generateFromOrder, generateByProcess, getOrdersForGenerate, getPreparationDetails, updatePreparationDetails, getPreparationDetailsGrouped, getProcessPrepStatus } from './materialPreparation.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getMaterialPreparations);
router.get('/export', authenticate, exportMaterialPreparations);
router.get('/orders-for-generate', authenticate, getOrdersForGenerate);
router.get('/process-prep-status/:orderNo', authenticate, getProcessPrepStatus);
router.get('/:id/details', authenticate, getPreparationDetails);
router.get('/:id/details-grouped', authenticate, getPreparationDetailsGrouped);
router.post('/import', authenticate, upload.single('file'), importMaterialPreparations);
router.post('/generate-from-order', authenticate, generateFromOrder);
router.post('/generate-by-process', authenticate, generateByProcess);
router.post('/', authenticate, validateCreateMaterialPreparation, createMaterialPreparation);
router.put('/:id', authenticate, validateUpdateMaterialPreparation, updateMaterialPreparation);
router.put('/:id/details', authenticate, updatePreparationDetails);
router.delete('/:id', authenticate, deleteMaterialPreparation);

export default router;
