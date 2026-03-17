import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { getEquipments, createEquipment, updateEquipment, deleteEquipment, exportEquipments, importEquipments } from '../controllers/equipment.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getEquipments);
router.get('/export', authenticate, exportEquipments);
router.post('/import', authenticate, upload.single('file'), importEquipments);
router.post('/', authenticate, createEquipment);
router.put('/:id', authenticate, updateEquipment);
router.delete('/:id', authenticate, deleteEquipment);

export default router;
