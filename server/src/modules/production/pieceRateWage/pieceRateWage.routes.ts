import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreatePieceRateWage, validateUpdatePieceRateWage } from '../../../validators/production.validator';
import {
  getPieceRateWages, getPieceRateWageDetail, getPieceRateWageSummary,
  createPieceRateWage, updatePieceRateWage, deletePieceRateWage,
  calculatePieceRateWage, exportPieceRateWages, exportPieceRateWagesSelected
} from './pieceRateWage.controller';

const router = Router();

router.get('/', authenticate, getPieceRateWages);
router.get('/export', authenticate, exportPieceRateWages);
router.post('/export-selected', authenticate, exportPieceRateWagesSelected);
router.post('/', authenticate, validateCreatePieceRateWage, createPieceRateWage);
router.post('/:id/calculate', authenticate, calculatePieceRateWage);
router.get('/:id/summary', authenticate, getPieceRateWageSummary);
router.get('/:id', authenticate, getPieceRateWageDetail);
router.put('/:id', authenticate, validateUpdatePieceRateWage, updatePieceRateWage);
router.delete('/:id', authenticate, deletePieceRateWage);

export default router;
