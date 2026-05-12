import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateStandardCost, validateUpdateStandardCost } from '../../../validators/purchasing.validator';
import multer from 'multer';
import {
  getStandardCosts, getStandardCostDetail, createStandardCost,
  updateStandardCost, deleteStandardCost,
  exportStandardCosts, importStandardCost
} from './standardCost.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getStandardCosts);
router.get('/export', authenticate, exportStandardCosts);
router.post('/import', authenticate, upload.single('file'), importStandardCost);
router.post('/', authenticate, validateCreateStandardCost, createStandardCost);
router.get('/:id', authenticate, getStandardCostDetail);
router.put('/:id', authenticate, validateUpdateStandardCost, updateStandardCost);
router.delete('/:id', authenticate, deleteStandardCost);

export default router;