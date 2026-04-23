import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getMouldMaintenances, createMouldMaintenance, updateMouldMaintenance,
  deleteMouldMaintenance, exportMouldMaintenances, importMouldMaintenances
} from './mouldMaintenance.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getMouldMaintenances);
router.get('/export', authenticate, exportMouldMaintenances);
router.post('/import', authenticate, upload.single('file'), importMouldMaintenances);
router.post('/', authenticate, createMouldMaintenance);
router.put('/:id', authenticate, updateMouldMaintenance);
router.delete('/:id', authenticate, deleteMouldMaintenance);

export default router;
