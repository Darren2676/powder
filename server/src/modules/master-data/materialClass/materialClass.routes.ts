import { Router } from 'express';
import multer from 'multer';
import { validateCreateMaterialClass, validateUpdateMaterialClass } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getList, create, update, remove, exportData, importData } from './materialClass.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getList);
router.get('/export', authenticate, exportData);
router.post('/import', authenticate, upload.single('file'), importData);
router.post('/', authenticate, validateCreateMaterialClass, create);
router.put('/:id', authenticate, validateUpdateMaterialClass, update);
router.delete('/:id', authenticate, remove);

export default router;
