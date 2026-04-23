import { Router } from 'express';
import {
  getPermissionTree,
  getAllPermissions,
  createPermission,
  updatePermission,
  deletePermission,
  getMyPermissions,
  getMyMenuTree
} from './permission.controller';
import { authenticate } from '../../../middleware/auth.middleware';
import { requirePermission } from '../../../middleware/permission.middleware';

const router = Router();

// 当前用户权限 - 不需要特定权限校验，任何登录用户都可查自己的权限
router.get('/mine', authenticate, getMyPermissions);
router.get('/menu-tree', authenticate, getMyMenuTree);

// 权限管理 - 需要系统设置权限
router.get('/tree', authenticate, requirePermission('system'), getPermissionTree);
router.get('/', authenticate, requirePermission('system'), getAllPermissions);
router.post('/', authenticate, requirePermission('system'), createPermission);
router.put('/:id', authenticate, requirePermission('system'), updatePermission);
router.delete('/:id', authenticate, requirePermission('system'), deletePermission);

export default router;
