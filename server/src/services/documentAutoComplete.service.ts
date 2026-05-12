/**
 * 单据自动完成服务
 * 根据配置表 document_completion_config 中的条件，自动判定并设置单据完成状态
 */
import sequelize from '@/config/database';
import { createLogger } from '@/config/logger';
import { COMPLETION_STATUS } from '@/shared/constants/statuses';

const log = createLogger('documentAutoComplete');

// ==================== 类型定义 ====================
interface Condition {
  field: string;
  operator: 'equals' | 'in' | 'all_lines';
  value: string | string[];
  scope: 'header' | 'detail';
  required: boolean;
  label: string;
}

interface CompletionConfig {
  document_type: string;
  document_type_name: string;
  enabled: boolean;
  conditions: Condition[];
  tolerance_pct: number;
  completion_status: string;
}

// ==================== 配置缓存 ====================
let configCache: Record<string, CompletionConfig> = {};
let cacheTime = 0;
const CACHE_TTL = 30_000; // 30秒缓存

async function loadConfig(documentType: string): Promise<CompletionConfig | null> {
  const now = Date.now();
  if (now - cacheTime > CACHE_TTL) {
    configCache = {};
    cacheTime = now;
  }

  if (configCache[documentType]) {
    return configCache[documentType];
  }

  try {
    const [rows]: any = await sequelize.query(
      `SELECT document_type, document_type_name, enabled, conditions, tolerance_pct, completion_status
       FROM document_completion_config WHERE document_type = :dt`,
      { replacements: { dt: documentType } }
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    const config: CompletionConfig = {
      document_type: row.document_type,
      document_type_name: row.document_type_name,
      enabled: !!row.enabled,
      conditions: JSON.parse(row.conditions),
      tolerance_pct: Number(row.tolerance_pct) || 0,
      completion_status: row.completion_status,
    };

    configCache[documentType] = config;
    return config;
  } catch (e) {
    log.warn({ documentType, error: (e as Error).message }, '加载自动完成配置失败');
    return null;
  }
}

/** 清除缓存（配置更新后调用） */
export function clearConfigCache(): void {
  configCache = {};
  cacheTime = 0;
}

// ==================== 条件评估 ====================

function evaluateCondition(condition: Condition, header: Record<string, any>, details: Record<string, any>[]): boolean {
  const { field, operator, value, scope } = condition;

  if (scope === 'header') {
    const fieldValue = header[field];
    if (operator === 'equals') {
      return fieldValue === value;
    } else if (operator === 'in') {
      return Array.isArray(value) && value.includes(fieldValue);
    }
    return false;
  }

  // scope === 'detail': 所有明细行都必须满足
  if (details.length === 0) return false;

  return details.every(detail => {
    const fieldValue = detail[field];
    if (operator === 'equals') {
      return fieldValue === value;
    } else if (operator === 'in') {
      return Array.isArray(value) && value.includes(fieldValue);
    } else if (operator === 'all_lines') {
      return Array.isArray(value) ? value.includes(fieldValue) : fieldValue === value;
    }
    return false;
  });
}

// ==================== 自动完成主逻辑 ====================

/**
 * 检查并自动完成单据
 * @param documentType 单据类型: sales_order / production_order / purchase_order
 * @param documentNumber 单据编号
 * @param transaction 数据库事务
 * @returns 是否触发了自动完成
 */
export async function checkAndAutoComplete(
  documentType: string,
  documentNumber: string,
  transaction: any
): Promise<{ completed: boolean; reason?: string }> {
  try {
    const config = await loadConfig(documentType);
    if (!config || !config.enabled) {
      return { completed: false, reason: config ? '自动完成未启用' : '无配置' };
    }

    // 查询单据头+明细
    const { header, details } = await fetchDocument(documentType, documentNumber, transaction);
    if (!header) {
      return { completed: false, reason: '单据不存在' };
    }

    // 检查是否已经是完成状态
    if (isAlreadyCompleted(documentType, header)) {
      return { completed: false, reason: '已是完成状态' };
    }

    // 逐条评估条件
    let allPass = true;
    for (const condition of config.conditions) {
      if (!condition.required) continue;
      const passed = evaluateCondition(condition, header, details);
      if (!passed) {
        allPass = false;
        break;
      }
    }

    if (allPass) {
      await markComplete(documentType, documentNumber, config.completion_status, transaction);
      log.info({ documentType, documentNumber, status: config.completion_status }, '单据自动完成');
      return { completed: true };
    }

    return { completed: false, reason: '条件未全部满足' };
  } catch (e) {
    log.warn({ documentType, documentNumber, error: (e as Error).message }, '自动完成检查异常');
    return { completed: false, reason: (e as Error).message };
  }
}

// ==================== 数据查询 ====================

async function fetchDocument(
  documentType: string,
  documentNumber: string,
  transaction: any
): Promise<{ header: Record<string, any> | null; details: Record<string, any>[] }> {
  const txOpt = transaction ? { transaction } : {};

  switch (documentType) {
    case 'sales_order': {
      const [headers]: any = await sequelize.query(
        `SELECT * FROM sales_order WHERE sales_order_number = :num`,
        { replacements: { num: documentNumber }, ...txOpt }
      );
      const [details]: any = await sequelize.query(
        `SELECT * FROM sales_order_detail WHERE sales_order_number = :num`,
        { replacements: { num: documentNumber }, ...txOpt }
      );
      return { header: headers[0] || null, details };
    }
    case 'production_order': {
      const [headers]: any = await sequelize.query(
        `SELECT * FROM production_order WHERE production_order_number = :num`,
        { replacements: { num: documentNumber }, ...txOpt }
      );
      // 生产单无明细表，条件都基于header
      return { header: headers[0] || null, details: [] };
    }
    case 'purchase_order': {
      const [headers]: any = await sequelize.query(
        `SELECT * FROM purchase_order WHERE purchase_order_number = :num`,
        { replacements: { num: documentNumber }, ...txOpt }
      );
      const [details]: any = await sequelize.query(
        `SELECT * FROM purchase_order_detail WHERE purchase_order_number = :num`,
        { replacements: { num: documentNumber }, ...txOpt }
      );
      return { header: headers[0] || null, details };
    }
    default:
      return { header: null, details: [] };
  }
}

function isAlreadyCompleted(documentType: string, header: Record<string, any>): boolean {
  switch (documentType) {
    case 'sales_order':
      return header.order_status === '已完成' || header.order_status === '已取消';
    case 'production_order':
      return header.completion_status === COMPLETION_STATUS.COMPLETED;
    case 'purchase_order':
      return header.order_status === '已完成' || header.order_status === '已关闭';
    default:
      return false;
  }
}

// ==================== 标记完成 ====================

async function markComplete(
  documentType: string,
  documentNumber: string,
  completionStatus: string,
  transaction: any
): Promise<void> {
  switch (documentType) {
    case 'sales_order':
      await sequelize.query(
        `UPDATE sales_order SET order_status = :status WHERE sales_order_number = :num`,
        { replacements: { status: completionStatus, num: documentNumber }, transaction }
      );
      break;
    case 'production_order':
      await sequelize.query(
        `UPDATE production_order SET completion_status = :status WHERE production_order_number = :num`,
        { replacements: { status: completionStatus, num: documentNumber }, transaction }
      );
      break;
    case 'purchase_order':
      await sequelize.query(
        `UPDATE purchase_order SET order_status = :status WHERE purchase_order_number = :num`,
        { replacements: { status: completionStatus, num: documentNumber }, transaction }
      );
      break;
  }
}

// ==================== 配置CRUD辅助 ====================

export async function getAllConfigs(): Promise<any[]> {
  const [rows]: any = await sequelize.query(
    `SELECT * FROM document_completion_config ORDER BY id`
  );
  return rows;
}

export async function getConfigByType(documentType: string): Promise<any | null> {
  const [rows]: any = await sequelize.query(
    `SELECT * FROM document_completion_config WHERE document_type = :dt`,
    { replacements: { dt: documentType } }
  );
  return rows[0] || null;
}

export async function updateConfig(
  documentType: string,
  data: { enabled?: boolean; conditions?: string; tolerance_pct?: number; updated_by?: string }
): Promise<void> {
  const sets: string[] = [];
  const replacements: Record<string, any> = { dt: documentType };

  if (data.enabled !== undefined) {
    sets.push('enabled = :enabled');
    replacements.enabled = data.enabled ? 1 : 0;
  }
  if (data.conditions !== undefined) {
    sets.push('conditions = :conditions');
    replacements.conditions = data.conditions;
  }
  if (data.tolerance_pct !== undefined) {
    sets.push('tolerance_pct = :tolerance_pct');
    replacements.tolerance_pct = data.tolerance_pct;
  }
  if (data.updated_by !== undefined) {
    sets.push('updated_by = :updated_by');
    replacements.updated_by = data.updated_by;
  }
  sets.push('updated_at = GETDATE()');

  if (sets.length > 1) { // 至少有一个业务字段+updated_at
    await sequelize.query(
      `UPDATE document_completion_config SET ${sets.join(', ')} WHERE document_type = :dt`,
      { replacements }
    );
    clearConfigCache();
  }
}

/** 默认种子条件（用于重置） */
const DEFAULT_CONDITIONS: Record<string, string> = {
  sales_order: JSON.stringify([
    { field: 'shipping_status', operator: 'in', value: ['全部发货', '超额发货'], scope: 'detail', required: true, label: '所有明细行已全部发货' }
  ]),
  production_order: JSON.stringify([
    { field: 'plan_status', operator: 'equals', value: '已完成', scope: 'header', required: true, label: '生产状态=已完成' },
    { field: 'inbound_status', operator: 'equals', value: '全部入库', scope: 'header', required: true, label: '入库状态=全部入库' }
  ]),
  purchase_order: JSON.stringify([
    { field: 'receive_status', operator: 'equals', value: '已到货', scope: 'detail', required: true, label: '所有明细行已到货' }
  ]),
};

export async function resetConfig(documentType: string, updatedBy?: string): Promise<void> {
  const defaultConditions = DEFAULT_CONDITIONS[documentType];
  if (!defaultConditions) return;

  await sequelize.query(
    `UPDATE document_completion_config SET conditions = :conditions, enabled = 1, tolerance_pct = 0, updated_by = :updated_by, updated_at = GETDATE()
     WHERE document_type = :dt`,
    { replacements: { conditions: defaultConditions, updated_by: updatedBy || '', dt: documentType } }
  );
  clearConfigCache();
}
