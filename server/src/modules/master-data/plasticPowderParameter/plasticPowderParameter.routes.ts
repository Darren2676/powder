import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import multer from 'multer';
import {
  getPlasticPowderParameters, createPlasticPowderParameter, updatePlasticPowderParameter,
  deletePlasticPowderParameter, exportPlasticPowderParameters, importPlasticPowderParameters,
  approvePlasticPowderParameter, withdrawPlasticPowderParameter, getAllPlasticPowderParameters
} from './plasticPowderParameter.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getPlasticPowderParameters);
router.get('/all', authenticate, getAllPlasticPowderParameters);
router.get('/export', authenticate, exportPlasticPowderParameters);
router.post('/import', authenticate, upload.single('file'), importPlasticPowderParameters);
router.post('/', authenticate, createPlasticPowderParameter);
router.put('/:id', authenticate, updatePlasticPowderParameter);
router.delete('/:id', authenticate, deletePlasticPowderParameter);
router.put('/:id/approve', authenticate, approvePlasticPowderParameter);
router.put('/:id/withdraw', authenticate, withdrawPlasticPowderParameter);

export default router;
