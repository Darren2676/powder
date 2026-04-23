import { Router } from 'express';
import multer from 'multer';
import { validateCreateWarehouse, validateUpdateWarehouse } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getWarehouses, getWarehouseDetail, createWarehouse, updateWarehouse, deleteWarehouse, exportWarehouses, importWarehouses, addWarehouseManager, removeWarehouseManager, approveWarehouse, withdrawWarehouse } from './warehouse.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getWarehouses);
router.get('/export', authenticate, exportWarehouses);
router.get('/:id', authenticate, getWarehouseDetail);
router.post('/import', authenticate, upload.single('file'), importWarehouses);
router.post('/', authenticate, validateCreateWarehouse, createWarehouse);
router.put('/:id', authenticate, validateUpdateWarehouse, updateWarehouse);
router.put('/:id/approve', authenticate, approveWarehouse);
router.put('/:id/withdraw', authenticate, withdrawWarehouse);
router.delete('/manager/:managerId', authenticate, removeWarehouseManager);
router.delete('/:id', authenticate, deleteWarehouse);
router.post('/:id/managers', authenticate, addWarehouseManager);

export default router;
