import { Router } from 'express';
import multer from 'multer';
import { validateCreateProduct, validateUpdateProduct } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getProducts, createProduct, updateProduct, deleteProduct, exportProducts, importProducts } from './product.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getProducts);
router.get('/export', authenticate, exportProducts);
router.post('/import', authenticate, upload.single('file'), importProducts);
router.post('/', authenticate, validateCreateProduct, createProduct);
router.put('/:itemNumber', authenticate, validateUpdateProduct, updateProduct);
router.delete('/:itemNumber', authenticate, deleteProduct);

export default router;
