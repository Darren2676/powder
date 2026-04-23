import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireRole } from '../../../middleware/role.middleware';
import {
  searchAfterRecords,
  queryRecords,
  syncInspectRecords,
  getLocalInspectRecords,
  testConnection,
  queryLines,
  syncInspectLines,
  getLocalInspectLines,
  getInspectSummary,
  queryInventory
} from './xinheyunInspect.controller';

const router = Router();

// 测试新核云连接
router.get('/test', authenticate, testConnection);

// 获取本地已同步的检验记录（带分页搜索）
router.get('/records', authenticate, getLocalInspectRecords);

// 标准分页查询（直接从新核云查询）
router.post('/query', authenticate, queryRecords);

// 分批查询（游标式翻页，直接从新核云查询）
router.post('/search-after', authenticate, searchAfterRecords);

// 同步检验记录到本地（管理员/经理权限）
router.post('/sync', authenticate, requireRole('admin', 'manager'), syncInspectRecords);

// ==================== 检验明细行 ====================

// 获取本地已同步的检验明细行（带分页搜索）
router.get('/lines', authenticate, getLocalInspectLines);

// 标准分页查询明细行（直接从新核云查询）
router.post('/lines/query', authenticate, queryLines);

// 同步检验明细行到本地（管理员/经理权限）
router.post('/lines/sync', authenticate, requireRole('admin', 'manager'), syncInspectLines);

// ==================== 检验报工汇总 ====================

// 获取检验报工汇总（按生产单号聚合）
router.get('/summary', authenticate, getInspectSummary);

// ==================== 库存明细查询 ====================

// 查询新核云库存明细（实时查询）
router.post('/inventory/query', authenticate, queryInventory);

export default router;
