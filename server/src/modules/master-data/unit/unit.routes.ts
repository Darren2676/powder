import { Router } from 'express';
import multer from 'multer';
import { validateCreateUnit, validateUpdateUnit } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getUnits, createUnit, updateUnit, deleteUnit, exportUnits, importUnits, getUnitConversions, getAllUnits, toggleUnitStatus, approveUnit, withdrawUnit } from './unit.controller';
import { getConversions, createConversion, updateConversion, deleteConversion, convert } from './unitConversion.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// 单位管理
router.get('/', authenticate, getUnits);
router.get('/all', authenticate, getAllUnits);
router.get('/export', authenticate, exportUnits);
router.post('/import', authenticate, upload.single('file'), importUnits);
router.post('/', authenticate, createUnit);
router.get('/:id/conversions', authenticate, getUnitConversions);
router.put('/:id', authenticate, validateUpdateUnit, updateUnit);
router.put('/:id/toggle-status', authenticate, toggleUnitStatus);
router.put('/:id/approve', authenticate, approveUnit);
router.put('/:id/withdraw', authenticate, withdrawUnit);
router.delete('/:id', authenticate, deleteUnit);

// 单位换算
router.get('/conversions', authenticate, getConversions);
router.get('/conversions/convert', authenticate, convert);
router.post('/conversions', authenticate, createConversion);
router.put('/conversions/:id', authenticate, updateConversion);
router.delete('/conversions/:id', authenticate, deleteConversion);

export default router;
