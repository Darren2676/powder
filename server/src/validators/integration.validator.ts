import { validateBody } from './index';

// ==================== 新合力检验同步 ====================

// 搜索检验记录
export const validateXinheyunSearchRecords = validateBody([
  { field: 'pageSize', label: '每页条数', type: 'number' },
]);

// 查询检验记录
export const validateXinheyunQueryRecords = validateBody([]);

// 同步检验记录
export const validateXinheyunSyncRecords = validateBody([]);

// ==================== 新合力库存同步 ====================

// 库存 Webhook 无需校验（外部系统推送）

// ==================== 批次追溯 ====================

// 批次追溯为只读接口，无需校验
