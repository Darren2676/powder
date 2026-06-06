/**
 * factoryWhere.util - 单元测试
 * 验证工厂隔离核心逻辑：getFactoryId / factoryWhere / insertFactoryField
 */
import { describe, it, expect, vi } from 'vitest';

// Mock sequelize - factoryWhere.util 导入了 sequelize
vi.mock('../config/database', () => ({
  default: { query: vi.fn() },
}));

import { getFactoryId, factoryWhere, insertFactoryField } from './factoryWhere.util';
import { Request } from 'express';

// ─── helper: 构造带 factoryScope 的 mock request ───
function mockReq(scope?: { mode: 'all' | 'single'; factory_id?: number | null; filter: boolean; accessibleFactories?: number[] }): Request {
  return { factoryScope: scope } as any;
}

// ═══════════════════════════════════════════════════════
// getFactoryId
// ═══════════════════════════════════════════════════════
describe('getFactoryId', () => {
  it('工厂模式：filter=true + factory_id 有值 → 返回 factory_id', () => {
    const req = mockReq({ mode: 'single', factory_id: 1, filter: true });
    expect(getFactoryId(req)).toBe(1);
  });

  it('工厂模式：factory_id=14 → 返回 14', () => {
    const req = mockReq({ mode: 'single', factory_id: 14, filter: true });
    expect(getFactoryId(req)).toBe(14);
  });

  it('总部模式：filter=false → 返回 null', () => {
    const req = mockReq({ mode: 'all', factory_id: null, filter: false });
    expect(getFactoryId(req)).toBeNull();
  });

  it('总部模式：filter=true 但 factory_id=null → 返回 null', () => {
    const req = mockReq({ mode: 'all', factory_id: null, filter: true });
    expect(getFactoryId(req)).toBeNull();
  });

  it('无 factoryScope → 返回 null', () => {
    const req = {} as Request;
    expect(getFactoryId(req)).toBeNull();
  });

  it('factoryScope=undefined → 返回 null', () => {
    const req = mockReq(undefined);
    expect(getFactoryId(req)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════
// factoryWhere — 条件注入测试
// ═══════════════════════════════════════════════════════
describe('factoryWhere', () => {
  const factoryScope = { mode: 'single' as const, factory_id: 14, filter: true };
  const hqScope = { mode: 'all' as const, factory_id: null, filter: false };

  it('总部模式：SQL 不变，replacements 不变', () => {
    const result = factoryWhere('SELECT * FROM sales_order WHERE status = @status', { status: '已审批' }, hqScope);
    expect(result.sql).toBe('SELECT * FROM sales_order WHERE status = @status');
    expect(result.replacements).toEqual({ status: '已审批' });
  });

  it('无 scope：SQL 不变', () => {
    const result = factoryWhere('SELECT * FROM sales_order', {});
    expect(result.sql).toBe('SELECT * FROM sales_order');
  });

  it('工厂模式 + 有 WHERE：在 WHERE 后追加 AND factory_id 条件', () => {
    const result = factoryWhere('SELECT * FROM sales_order WHERE status = @status', { status: '已审批' }, factoryScope);
    // 应该在 WHERE 后插入 "t.factory_id = @_factoryId_xxx AND"
    expect(result.sql).toContain('WHERE');
    expect(result.sql).toContain('t.factory_id = @');
    expect(result.sql).toContain('AND');
    // replacements 应包含 factory_id 值
    const factoryKey = Object.keys(result.replacements).find(k => k.startsWith('_factoryId_'));
    expect(factoryKey).toBeTruthy();
    expect(result.replacements[factoryKey!]).toBe(14);
    // 原有 status 参数保留
    expect(result.replacements.status).toBe('已审批');
  });

  it('工厂模式 + 无 WHERE + 无 GROUP/ORDER：末尾追加 WHERE', () => {
    const result = factoryWhere('SELECT * FROM sales_order', {}, factoryScope);
    expect(result.sql).toContain('WHERE t.factory_id = @');
  });

  it('工厂模式 + 无 WHERE + 有 GROUP BY：在 GROUP BY 前插入 WHERE', () => {
    const result = factoryWhere('SELECT status, COUNT(*) FROM sales_order GROUP BY status', {}, factoryScope);
    const upperResult = result.sql.toUpperCase();
    const whereIdx = upperResult.indexOf('WHERE');
    const groupByIdx = upperResult.indexOf('GROUP BY');
    expect(whereIdx).toBeGreaterThan(-1);
    expect(groupByIdx).toBeGreaterThan(-1);
    expect(whereIdx).toBeLessThan(groupByIdx);
  });

  it('工厂模式 + 自定义表别名', () => {
    const result = factoryWhere('SELECT * FROM sales_order so WHERE so.status = @status', { status: '已审批' }, factoryScope, 'so');
    expect(result.sql).toContain('so.factory_id = @');
  });
});

// ═══════════════════════════════════════════════════════
// insertFactoryField — INSERT 语句工厂字段注入
// ═══════════════════════════════════════════════════════
describe('insertFactoryField', () => {
  const factoryScope = { mode: 'single' as const, factory_id: 14, filter: true };
  const hqScope = { mode: 'all' as const, factory_id: null, filter: false };

  it('总部模式：columns 和 valuesClause 不变', () => {
    const result = insertFactoryField(['order_number', 'status'], '@order_number, @status', hqScope);
    expect(result.columns).toEqual(['order_number', 'status']);
    expect(result.valuesClause).toBe('@order_number, @status');
  });

  it('工厂模式：追加 factory_id 列和值', () => {
    const result = insertFactoryField(['order_number', 'status'], '@order_number, @status', factoryScope);
    expect(result.columns).toContain('factory_id');
    expect(result.valuesClause).toContain('14');
  });

  it('无 scope：columns 和 valuesClause 不变', () => {
    const result = insertFactoryField(['order_number'], '@order_number');
    expect(result.columns).toEqual(['order_number']);
    expect(result.valuesClause).toBe('@order_number');
  });
});

// ═══════════════════════════════════════════════════════
// 集成验证：Controller 中 _factoryId !== null 模式
// 模拟 Controller 中常见的 factoryCond / factoryReps 模式
// ═══════════════════════════════════════════════════════
describe('Controller factoryCond/factoryReps 模式验证', () => {
  it('工厂模式：factoryCond + factoryReps 正确拼接', () => {
    const req = mockReq({ mode: 'single', factory_id: 14, filter: true });
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    expect(_factoryId).toBe(14);
    expect(factoryCond).toBe(' AND factory_id = :_factoryId');
    expect(factoryReps).toEqual({ _factoryId: 14 });

    // 模拟 SQL 拼接
    const sql = `SELECT * FROM sales_order WHERE status = :status${factoryCond}`;
    expect(sql).toBe('SELECT * FROM sales_order WHERE status = :status AND factory_id = :_factoryId');

    // 模拟 replacements 合并
    const replacements = { status: '已审批', ...factoryReps };
    expect(replacements).toEqual({ status: '已审批', _factoryId: 14 });
  });

  it('总部模式：factoryCond 为空，factoryReps 为空对象', () => {
    const req = mockReq({ mode: 'all', factory_id: null, filter: false });
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    expect(_factoryId).toBeNull();
    expect(factoryCond).toBe('');
    expect(factoryReps).toEqual({});

    // SQL 不变
    const sql = `SELECT * FROM sales_order WHERE status = :status${factoryCond}`;
    expect(sql).toBe('SELECT * FROM sales_order WHERE status = :status');
  });

  it('conditions 数组模式：工厂模式添加 factory_id 条件', () => {
    const req = mockReq({ mode: 'single', factory_id: 15, filter: true });
    const _factoryId = getFactoryId(req);
    const conditions: string[] = ['status = :status'];
    const replacements: Record<string, any> = { status: '已审批' };

    if (_factoryId !== null) {
      conditions.push('factory_id = :_factoryId');
      replacements._factoryId = _factoryId;
    }

    expect(conditions).toContain('factory_id = :_factoryId');
    expect(replacements._factoryId).toBe(15);
  });

  it('conditions 数组模式：总部模式不添加 factory_id 条件', () => {
    const req = mockReq({ mode: 'all', factory_id: null, filter: false });
    const _factoryId = getFactoryId(req);
    const conditions: string[] = ['status = :status'];
    const replacements: Record<string, any> = { status: '已审批' };

    if (_factoryId !== null) {
      conditions.push('factory_id = :_factoryId');
      replacements._factoryId = _factoryId;
    }

    expect(conditions).not.toContain('factory_id = :_factoryId');
    expect(replacements._factoryId).toBeUndefined();
  });
});
