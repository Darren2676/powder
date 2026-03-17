import { Router } from 'express';
import { getComments, createComment, updateComment, deleteComment } from '../controllers/comment.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/tickets/:ticketId/comments', authenticate, getComments);
router.post('/tickets/:ticketId/comments', authenticate, createComment);
router.put('/comments/:id', authenticate, updateComment);
router.delete('/comments/:id', authenticate, deleteComment);

export default router;
