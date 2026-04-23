import { Router } from 'express';
import {
  getSecuritySettings,
  updateSecuritySettings,
  getPasswordPolicyApi,
  getLoginLogs,
  resetUserPassword,
  unlockUser
} from './security.controller';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireRole } from '../../../middleware/role.middleware';

const router = Router();

// 公开接口 - 获取密码策略（注册页面需要）
router.get('/password-policy', getPasswordPolicyApi);

// 管理员接口
router.get('/settings', authenticate, requireRole('admin'), getSecuritySettings);
router.put('/settings', authenticate, requireRole('admin'), updateSecuritySettings);
router.get('/login-logs', authenticate, requireRole('admin'), getLoginLogs);
router.put('/users/:id/reset-password', authenticate, requireRole('admin'), resetUserPassword);
router.put('/users/:id/unlock', authenticate, requireRole('admin'), unlockUser);

export default router;
