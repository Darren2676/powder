import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getLifecycles,
  getLifecycleDetail,
  createLifecycle,
  updateLifecycle,
  updateLifecycleStatus,
  deleteLifecycle,
  getLogs,
  createLog,
  updateLog,
  deleteLog,
  getChangeTypes,
} from './engineeringChange.controller';

const router = Router();

// 静态路径放在 :id 之前，避免冲突
router.get('/change-types', authenticate, getChangeTypes);

// 主表 CRUD
router.get('/', authenticate, getLifecycles);
router.post('/', authenticate, createLifecycle);
router.get('/:id', authenticate, getLifecycleDetail);
router.put('/:id', authenticate, updateLifecycle);
router.delete('/:id', authenticate, deleteLifecycle);

// 状态流转
router.patch('/:id/status', authenticate, updateLifecycleStatus);

// 变更日志（子表）CRUD
router.get('/:id/logs', authenticate, getLogs);
router.post('/:id/logs', authenticate, createLog);
router.put('/:id/logs/:logId', authenticate, updateLog);
router.delete('/:id/logs/:logId', authenticate, deleteLog);

export default router;
