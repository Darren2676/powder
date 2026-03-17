import { Router } from 'express';
import {
  getTickets,
  getTicketById,
  createTicket,
  updateTicket,
  deleteTicket,
  assignTicket,
  updateStatus,
  getMyCreatedTickets,
  getMyAssignedTickets
} from '../controllers/ticket.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

router.get('/', authenticate, getTickets);
router.get('/my/created', authenticate, getMyCreatedTickets);
router.get('/my/assigned', authenticate, getMyAssignedTickets);
router.get('/:id', authenticate, getTicketById);
router.post('/', authenticate, createTicket);
router.put('/:id', authenticate, updateTicket);
router.delete('/:id', authenticate, deleteTicket);
router.put('/:id/assign', authenticate, requireRole('admin', 'manager'), assignTicket);
router.put('/:id/status', authenticate, updateStatus);

export default router;
