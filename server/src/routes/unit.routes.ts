import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { getUnits, createUnit, updateUnit, deleteUnit, exportUnits, importUnits } from '../controllers/unit.controller';
import { getConversions, createConversion, updateConversion, deleteConversion, convert } from '../controllers/unitConversion.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// 单位管理
router.get('/', authenticate, getUnits);
router.get('/export', authenticate, exportUnits);
router.post('/import', authenticate, upload.single('file'), importUnits);
router.post('/', authenticate, createUnit);
router.put('/:id', authenticate, updateUnit);
router.delete('/:id', authenticate, deleteUnit);

// 单位换算
router.get('/conversions', authenticate, getConversions);
router.get('/conversions/convert', authenticate, convert);
router.post('/conversions', authenticate, createConversion);
router.put('/conversions/:id', authenticate, updateConversion);
router.delete('/conversions/:id', authenticate, deleteConversion);

export default router;
