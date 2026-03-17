import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { getGroups, createGroup, updateGroup, deleteGroup, exportGroups, importGroups } from '../controllers/group.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getGroups);
router.get('/export', authenticate, exportGroups);
router.post('/import', authenticate, upload.single('file'), importGroups);
router.post('/', authenticate, createGroup);
router.put('/:id', authenticate, updateGroup);
router.delete('/:id', authenticate, deleteGroup);

export default router;
