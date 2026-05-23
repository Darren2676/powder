import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreatePurchasePriceList, validateUpdatePurchasePriceList } from '../../../validators/purchasing.validator';
import multer from 'multer';
import {
  getPurchasePriceLists, getPurchasePriceListDetail, createPurchasePriceList,
  updatePurchasePriceList, deletePurchasePriceList,
  exportPurchasePriceLists, importPurchasePriceList,
  queryPurchasePrice, downloadImportTemplate
} from './purchasePrice.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getPurchasePriceLists);
router.get('/query-price', authenticate, queryPurchasePrice);
router.get('/export', authenticate, exportPurchasePriceLists);
router.get('/import-template', authenticate, downloadImportTemplate);
router.post('/import', authenticate, upload.single('file'), importPurchasePriceList);
router.post('/', authenticate, validateCreatePurchasePriceList, createPurchasePriceList);
router.get('/:id', authenticate, getPurchasePriceListDetail);
router.put('/:id', authenticate, validateUpdatePurchasePriceList, updatePurchasePriceList);
router.delete('/:id', authenticate, deletePurchasePriceList);

export default router;
