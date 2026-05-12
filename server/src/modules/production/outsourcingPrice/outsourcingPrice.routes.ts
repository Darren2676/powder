import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import multer from 'multer';
import {
  getOutsourcingPriceLists, getOutsourcingPriceListDetail, createOutsourcingPriceList,
  updateOutsourcingPriceList, deleteOutsourcingPriceList,
  exportOutsourcingPriceLists, importOutsourcingPriceList
} from './outsourcingPrice.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getOutsourcingPriceLists);
router.get('/export', authenticate, exportOutsourcingPriceLists);
router.post('/import', authenticate, upload.single('file'), importOutsourcingPriceList);
router.post('/', authenticate, createOutsourcingPriceList);
router.get('/:id', authenticate, getOutsourcingPriceListDetail);
router.put('/:id', authenticate, updateOutsourcingPriceList);
router.delete('/:id', authenticate, deleteOutsourcingPriceList);

export default router;
