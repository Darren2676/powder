import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getStockIns, getStockInDetail, createStockIn, deleteStockIn,
  confirmStockIn, exportStockIns
} from './stockIn.controller';
import { validateCreateStockIn } from '../../../validators/warehouse.validator';

const router = Router();

router.get('/', authenticate, getStockIns);
router.get('/export', authenticate, exportStockIns);
router.post('/', authenticate, validateCreateStockIn, createStockIn);
router.get('/:id', authenticate, getStockInDetail);
router.delete('/:id', authenticate, deleteStockIn);
router.post('/:id/confirm', authenticate, confirmStockIn);

export default router;
