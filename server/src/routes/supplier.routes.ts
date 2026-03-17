import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier, exportSuppliers, importSuppliers } from '../controllers/supplier.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getSuppliers);
router.get('/export', authenticate, exportSuppliers);
router.post('/import', authenticate, upload.single('file'), importSuppliers);
router.post('/', authenticate, createSupplier);
router.put('/:supplierId', authenticate, updateSupplier);
router.delete('/:supplierId', authenticate, deleteSupplier);

export default router;
