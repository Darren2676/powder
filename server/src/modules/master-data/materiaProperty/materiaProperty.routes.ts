import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateMateriaProperty, validateUpdateMateriaProperty } from '../../../validators/master-data.validator';
import { getList, create, update, remove, exportData, importData, approveMateriaProperty, withdrawMateriaProperty } from './materiaProperty.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getList);
router.get('/export', authenticate, exportData);
router.post('/import', authenticate, upload.single('file'), importData);
router.post('/', authenticate, validateCreateMateriaProperty, create);
router.put('/:id', authenticate, validateUpdateMateriaProperty, update);
router.put('/:id/approve', authenticate, approveMateriaProperty);
router.put('/:id/withdraw', authenticate, withdrawMateriaProperty);
router.delete('/:id', authenticate, remove);

export default router;
