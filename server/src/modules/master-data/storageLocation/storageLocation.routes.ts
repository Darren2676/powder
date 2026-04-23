import { Router } from 'express';
import multer from 'multer';
import { validateCreateStorageLocation, validateUpdateStorageLocation } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getStorageLocations, createStorageLocation, updateStorageLocation, deleteStorageLocation, exportStorageLocations, importStorageLocations, toggleStorageLocationStatus, approveStorageLocation, withdrawStorageLocation } from './storageLocation.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getStorageLocations);
router.get('/export', authenticate, exportStorageLocations);
router.post('/import', authenticate, upload.single('file'), importStorageLocations);
router.post('/', authenticate, validateCreateStorageLocation, createStorageLocation);
router.put('/:id', authenticate, validateUpdateStorageLocation, updateStorageLocation);
router.put('/:id/toggle-status', authenticate, toggleStorageLocationStatus);
router.put('/:id/approve', authenticate, approveStorageLocation);
router.put('/:id/withdraw', authenticate, withdrawStorageLocation);
router.delete('/:id', authenticate, deleteStorageLocation);

export default router;
