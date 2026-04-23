import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  receiveWebhook,
  getInventoryTransactions,
  getInventoryTransactionStats
} from './xinheyunInventory.controller';

const router = Router();

// ==================== Webhook 接收（无需JWT认证，由新核云推送） ====================
router.post('/webhook', receiveWebhook);

// ==================== 本地查询（需JWT认证） ====================

// 查询出入库记录（分页搜索）
router.get('/transactions', authenticate, getInventoryTransactions);

// 统计概览
router.get('/stats', authenticate, getInventoryTransactionStats);

export default router;
