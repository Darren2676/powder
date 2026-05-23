import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreatePieceRatePrice, validateUpdatePieceRatePrice } from '../../../validators/purchasing.validator';
import multer from 'multer';
import {
  getPieceRatePrices, getPieceRatePriceDetail, createPieceRatePrice,
  updatePieceRatePrice, deletePieceRatePrice,
  exportPieceRatePrices, exportPieceRatePricesSelected, importPieceRatePrice,
  downloadImportTemplate
} from './pieceRatePrice.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getPieceRatePrices);
router.get('/export', authenticate, exportPieceRatePrices);
router.get('/import-template', authenticate, downloadImportTemplate);
router.post('/export-selected', authenticate, exportPieceRatePricesSelected);
router.post('/import', authenticate, upload.single('file'), importPieceRatePrice);
router.post('/', authenticate, validateCreatePieceRatePrice, createPieceRatePrice);
router.get('/:id', authenticate, getPieceRatePriceDetail);
router.put('/:id', authenticate, validateUpdatePieceRatePrice, updatePieceRatePrice);
router.delete('/:id', authenticate, deletePieceRatePrice);

export default router;
