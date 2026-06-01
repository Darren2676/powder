import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import multer from 'multer';
import {
  getPlasticProcessCategories, createPlasticProcessCategory, updatePlasticProcessCategory,
  deletePlasticProcessCategory, exportPlasticProcessCategories, importPlasticProcessCategories,
  approvePlasticProcessCategory, withdrawPlasticProcessCategory, getAllPlasticProcessCategories
} from './plasticProcessCategory.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getPlasticProcessCategories);
router.get('/all', authenticate, getAllPlasticProcessCategories);
router.get('/export', authenticate, exportPlasticProcessCategories);
router.post('/import', authenticate, upload.single('file'), importPlasticProcessCategories);
router.post('/', authenticate, createPlasticProcessCategory);
router.put('/:id', authenticate, updatePlasticProcessCategory);
router.delete('/:id', authenticate, deletePlasticProcessCategory);
router.put('/:id/approve', authenticate, approvePlasticProcessCategory);
router.put('/:id/withdraw', authenticate, withdrawPlasticProcessCategory);

export default router;
