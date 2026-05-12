// system 域路由聚合
import { Router } from 'express';
import authRoutes from './auth/auth.routes';
import userRoutes from './user/user.routes';
import roleRoutes from './role/role.routes';
import permissionRoutes from './permission/permission.routes';
import notificationRoutes from './notification/notification.routes';
import securityRoutes from './security/security.routes';
import userPreferenceRoutes from './userPreference/userPreference.routes';
import departmentRoutes from './department/department.routes';
import approvalRoutes from './approval/approval.routes';
import workflowRoutes from './workflow/workflow.routes';
import workflow_runtimeRoutes from './workflow/workflow-runtime.routes';
import sseRoutes from './sse/sse.routes';
import documentCompletionConfigRoutes from './documentCompletionConfig/documentCompletionConfig.routes';
import manualCloseRoutes from './manualClose/manualClose.routes';
import apiKeyRoutes from './apiKey/apiKey.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/permissions', permissionRoutes);
router.use('/notifications', notificationRoutes);
router.use('/security', securityRoutes);
router.use('/user-preferences', userPreferenceRoutes);
router.use('/departments', departmentRoutes);
router.use('/approval', approvalRoutes);
router.use('/workflows', workflowRoutes);
router.use('/workflow-runtime', workflow_runtimeRoutes);
router.use('/sse', sseRoutes);
router.use('/document-completion-config', documentCompletionConfigRoutes);
router.use('/manual-close', manualCloseRoutes);
router.use('/api-keys', apiKeyRoutes);

export default router;
