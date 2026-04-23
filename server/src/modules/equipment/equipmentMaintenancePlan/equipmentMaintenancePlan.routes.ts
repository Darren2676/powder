import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getEquipmentMaintenancePlans, createEquipmentMaintenancePlan, updateEquipmentMaintenancePlan,
  deleteEquipmentMaintenancePlan, executeMaintenancePlan, completeMaintenancePlan,
  cancelMaintenancePlan, autoGeneratePlans, exportEquipmentMaintenancePlans,
  approveEquipmentMaintenancePlan, withdrawEquipmentMaintenancePlan
} from './equipmentMaintenancePlan.controller';

const router = Router();

router.get('/', authenticate, getEquipmentMaintenancePlans);
router.get('/export', authenticate, exportEquipmentMaintenancePlans);
router.post('/auto-generate', authenticate, autoGeneratePlans);
router.post('/', authenticate, createEquipmentMaintenancePlan);
router.put('/:id/execute', authenticate, executeMaintenancePlan);
router.put('/:id/complete', authenticate, completeMaintenancePlan);
router.put('/:id/cancel', authenticate, cancelMaintenancePlan);
router.put('/:id', authenticate, updateEquipmentMaintenancePlan);
router.delete('/:id', authenticate, deleteEquipmentMaintenancePlan);
router.put('/:id/approve', authenticate, approveEquipmentMaintenancePlan);
router.put('/:id/withdraw', authenticate, withdrawEquipmentMaintenancePlan);

export default router;
