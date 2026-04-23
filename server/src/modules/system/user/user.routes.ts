import { Router } from 'express';
import {
  getUsers,
  createUser,
  getUserById,
  updateUser,
  updateUserRole,
  assignUserRoles,
  updateUserStatus,
  deleteUser,
  getAssignableUsers
} from './user.controller';
import { authenticate } from '../../../middleware/auth.middleware';
import { requirePermission } from '../../../middleware/permission.middleware';
import { validateCreateUser, validateUpdateUser } from '../../../validators/system.validator';

const router = Router();

router.get('/', authenticate, requirePermission('users'), getUsers);
router.post('/', authenticate, requirePermission('users'), validateCreateUser, createUser);
router.get('/assignable', authenticate, getAssignableUsers);
router.get('/:id', authenticate, requirePermission('users'), getUserById);
router.put('/:id', authenticate, requirePermission('users'), validateUpdateUser, updateUser);
router.put('/:id/role', authenticate, requirePermission('users'), updateUserRole);
router.put('/:id/roles', authenticate, requirePermission('users'), assignUserRoles);
router.put('/:id/status', authenticate, requirePermission('users'), updateUserStatus);
router.delete('/:id', authenticate, requirePermission('users'), deleteUser);

export default router;
