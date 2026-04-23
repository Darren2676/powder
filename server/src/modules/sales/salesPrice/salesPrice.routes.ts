import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateSalesPrice, validateUpdateSalesPrice } from '../../../validators/sales.validator';
import multer from 'multer';
import {
  getSalesPriceLists, getSalesPriceListDetail, createSalesPriceList,
  updateSalesPriceList, deleteSalesPriceList,
  exportSalesPriceLists, importSalesPriceList
} from './salesPrice.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getSalesPriceLists);
router.get('/export', authenticate, exportSalesPriceLists);
router.post('/import', authenticate, upload.single('file'), importSalesPriceList);
router.post('/', authenticate, validateCreateSalesPrice, createSalesPriceList);
router.get('/:id', authenticate, getSalesPriceListDetail);
router.put('/:id', authenticate, validateUpdateSalesPrice, updateSalesPriceList);
router.delete('/:id', authenticate, deleteSalesPriceList);

export default router;
