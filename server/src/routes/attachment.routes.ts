import { Router } from 'express';
import { uploadAttachment, downloadAttachment, deleteAttachment, getAttachments } from '../controllers/attachment.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.post('/tickets/:ticketId/attachments', authenticate, upload.single('file'), uploadAttachment);
router.get('/attachments/:id', authenticate, downloadAttachment);
router.delete('/attachments/:id', authenticate, deleteAttachment);
router.get('/tickets/:ticketId/attachments', authenticate, getAttachments);

export default router;
