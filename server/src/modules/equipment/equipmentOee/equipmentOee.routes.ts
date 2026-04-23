import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getEquipmentOees, saveEquipmentOee, deleteEquipmentOee,
  getOeeDashboard, calculateOeeFromProduction
} from './equipmentOee.controller';

const router = Router();

router.get('/dashboard', authenticate, getOeeDashboard);
router.get('/', authenticate, getEquipmentOees);
router.post('/calculate', authenticate, calculateOeeFromProduction);
router.post('/', authenticate, saveEquipmentOee);
router.delete('/:id', authenticate, deleteEquipmentOee);

export default router;
