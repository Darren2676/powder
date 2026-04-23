import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getEquipmentDowntimes, createEquipmentDowntime, updateEquipmentDowntime,
  deleteEquipmentDowntime, exportEquipmentDowntimes, approveEquipmentDowntime,
  withdrawEquipmentDowntime
} from './equipmentDowntime.controller';

const router = Router();

router.get('/', authenticate, getEquipmentDowntimes);
router.get('/export', authenticate, exportEquipmentDowntimes);
router.post('/', authenticate, createEquipmentDowntime);
router.put('/:id', authenticate, updateEquipmentDowntime);
router.delete('/:id', authenticate, deleteEquipmentDowntime);
router.put('/:id/approve', authenticate, approveEquipmentDowntime);
router.put('/:id/withdraw', authenticate, withdrawEquipmentDowntime);

export default router;
