import { Router } from 'express';
import multer from 'multer';
import { validateCreateProductClass, validateUpdateProductClass } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getList, create, update, remove, exportData, importData } from './productClass.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getList);
router.get('/export', authenticate, exportData);
router.post('/import', authenticate, upload.single('file'), importData);
router.post('/', authenticate, validateCreateProductClass, create);
router.put('/:id', authenticate, validateUpdateProductClass, update);
router.delete('/:id', authenticate, remove);

export default router;
