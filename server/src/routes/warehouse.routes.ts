import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, exportWarehouses, importWarehouses } from '../controllers/warehouse.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getWarehouses);
router.get('/export', authenticate, exportWarehouses);
router.post('/import', authenticate, upload.single('file'), importWarehouses);
router.post('/', authenticate, createWarehouse);
router.put('/:id', authenticate, updateWarehouse);
router.delete('/:id', authenticate, deleteWarehouse);

export default router;
