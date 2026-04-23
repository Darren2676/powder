import { Router } from 'express';
import {
  getRoles,
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  assignPermissions
} from './role.controller';
import { authenticate } from '../../../middleware/auth.middleware';
import { requirePermission } from '../../../middleware/permission.middleware';

const router = Router();

router.get('/', authenticate, requirePermission('system'), getRoles);
router.get('/all', authenticate, getAllRoles);
router.get('/:id', authenticate, requirePermission('system'), getRoleById);
router.post('/', authenticate, requirePermission('system'), createRole);
router.put('/:id', authenticate, requirePermission('system'), updateRole);
router.delete('/:id', authenticate, requirePermission('system'), deleteRole);
router.put('/:id/permissions', authenticate, requirePermission('system'), assignPermissions);

export default router;
