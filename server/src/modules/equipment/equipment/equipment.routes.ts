import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateEquipment, validateUpdateEquipment } from '../../../validators/equipment.validator';
import {
  getEquipments, createEquipment, updateEquipment, deleteEquipment,
  exportEquipments, importEquipments, approveEquipment, withdrawEquipment,
  getEquipmentStatusOverview, updateEquipmentStatus, updateEquipmentMaintenanceSettings
} from './equipment.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/status-overview', authenticate, getEquipmentStatusOverview);
router.get('/export', authenticate, exportEquipments);
router.get('/', authenticate, getEquipments);
router.post('/import', authenticate, upload.single('file'), importEquipments);
router.post('/', authenticate, validateCreateEquipment, createEquipment);
router.put('/:id/status', authenticate, updateEquipmentStatus);
router.put('/:id/maintenance-settings', authenticate, updateEquipmentMaintenanceSettings);
router.put('/:id', authenticate, validateUpdateEquipment, updateEquipment);
router.delete('/:id', authenticate, deleteEquipment);
router.put('/:id/approve', authenticate, approveEquipment);
router.put('/:id/withdraw', authenticate, withdrawEquipment);

export default router;
