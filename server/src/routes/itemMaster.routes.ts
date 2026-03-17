import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { getItems, getItemDetail, createItem, updateItem, deleteItem, exportItems, importItems } from '../controllers/itemMaster.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getItems);
router.get('/export', authenticate, exportItems);
router.post('/import', authenticate, upload.single('file'), importItems);
router.post('/', authenticate, createItem);
router.get('/:itemNumber', authenticate, getItemDetail);
router.put('/:itemNumber', authenticate, updateItem);
router.delete('/:itemNumber', authenticate, deleteItem);

export default router;
