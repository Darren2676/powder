import { Router } from 'express';
import {
  getUsers,
  createUser,
  getUserById,
  updateUser,
  updateUserRole,
  updateUserStatus,
  deleteUser,
  getAssignableUsers
} from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

router.get('/', authenticate, requireRole('admin'), getUsers);
router.post('/', authenticate, requireRole('admin'), createUser);
router.get('/assignable', authenticate, getAssignableUsers);
router.get('/:id', authenticate, requireRole('admin'), getUserById);
router.put('/:id', authenticate, requireRole('admin'), updateUser);
router.put('/:id/role', authenticate, requireRole('admin'), updateUserRole);
router.put('/:id/status', authenticate, requireRole('admin'), updateUserStatus);
router.delete('/:id', authenticate, requireRole('admin'), deleteUser);

export default router;
