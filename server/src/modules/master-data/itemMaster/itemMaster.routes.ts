import { Router } from 'express';
import multer from 'multer';
import { validateCreateItemMaster, validateUpdateItemMaster } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getItems, getItemDetail, createItem, updateItem, deleteItem, exportItems, importItems, approveItem, withdrawItem } from './itemMaster.controller';
import { getAttachments, uploadAttachment, downloadAttachment, deleteAttachment } from './itemAttachment.controller';
import { upload as diskUpload } from '../../../middleware/upload.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getItems);
router.get('/export', authenticate, exportItems);
router.post('/import', authenticate, upload.single('file'), importItems);
router.post('/', authenticate, createItem);
router.get('/:itemNumber', authenticate, getItemDetail);
router.put('/:itemNumber', authenticate, validateUpdateItemMaster, updateItem);
router.put('/:itemNumber/approve', authenticate, approveItem);
router.put('/:itemNumber/withdraw', authenticate, withdrawItem);
router.delete('/:itemNumber', authenticate, deleteItem);

// 附件管理路由
router.get('/:itemNumber/attachments', authenticate, getAttachments);
router.post('/:itemNumber/attachments', authenticate, diskUpload.single('file'), uploadAttachment);
router.get('/:itemNumber/attachments/:id/download', authenticate, downloadAttachment);
router.delete('/:itemNumber/attachments/:id', authenticate, deleteAttachment);

export default router;
