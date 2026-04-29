/**
 * 排产冲突检查 - 单元测试
 * 测试 checkSchedulingConflicts 的核心逻辑（纯函数测试，需 mock 数据库）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sequelize - 必须在工厂函数内部创建 mock，因为 vi.mock 会被提升
vi.mock('@/config/database', () => ({
  default: { query: vi.fn() },
}));

import sequelize from '@/config/database';
import { checkSchedulingConflicts } from './conflictCheck';

const mockQuery = sequelize.query as ReturnType<typeof vi.fn>;

describe('checkSchedulingConflicts', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('当无项目时应返回空冲突', async () => {
    const result = await checkSchedulingConflicts([]);
    expect(result.batchConflicts).toEqual([]);
    expect(result.dbConflicts).toEqual([]);
  });

  it('当本批次内同一模具+日期+班次分配给多条生产单时应报冲突', async () => {
    const items = [
      { productionOrderNumber: 'P001', mouldNumber: 'M001', productionDate: '2026-01-01', scheduleId: 'S01' },
      { productionOrderNumber: 'P002', mouldNumber: 'M001', productionDate: '2026-01-01', scheduleId: 'S01' },
    ];
    const result = await checkSchedulingConflicts(items);
    expect(result.batchConflicts.length).toBe(1);
    expect(result.batchConflicts[0]).toContain('M001');
    expect(result.batchConflicts[0]).toContain('P001');
    expect(result.batchConflicts[0]).toContain('P002');
  });

  it('当本批次内同一设备+日期+班次分配给多条生产单时应报冲突', async () => {
    const items = [
      { productionOrderNumber: 'P001', equipmentNumber: 'E001', productionDate: '2026-01-01', scheduleId: 'S01' },
      { productionOrderNumber: 'P002', equipmentNumber: 'E001', productionDate: '2026-01-01', scheduleId: 'S01' },
    ];
    const result = await checkSchedulingConflicts(items);
    expect(result.batchConflicts.length).toBe(1);
    expect(result.batchConflicts[0]).toContain('E001');
  });

  it('当批次内部有冲突时应直接返回不查数据库', async () => {
    const items = [
      { productionOrderNumber: 'P001', mouldNumber: 'M001', productionDate: '2026-01-01', scheduleId: 'S01' },
      { productionOrderNumber: 'P002', mouldNumber: 'M001', productionDate: '2026-01-01', scheduleId: 'S01' },
    ];
    const result = await checkSchedulingConflicts(items);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('当批次内部无冲突但数据库有冲突时应返回dbConflicts', async () => {
    // 模具DB检查返回冲突
    mockQuery.mockResolvedValueOnce([[{
      production_order_number: 'P099',
      mould_number: 'M001',
      production_date: '2026-01-01',
      schedule_id: 'S01',
    }]]);

    const items = [
      { productionOrderNumber: 'P001', mouldNumber: 'M001', productionDate: '2026-01-01', scheduleId: 'S01' },
    ];
    const result = await checkSchedulingConflicts(items);
    expect(result.batchConflicts).toEqual([]);
    expect(result.dbConflicts.length).toBe(1);
    expect(result.dbConflicts[0]).toContain('P099');
  });

  it('当不同班次使用同一模具不应报冲突', async () => {
    // 无DB冲突
    mockQuery.mockResolvedValueOnce([[]]);
    // 无设备DB冲突
    mockQuery.mockResolvedValueOnce([[]]);

    const items = [
      { productionOrderNumber: 'P001', mouldNumber: 'M001', productionDate: '2026-01-01', scheduleId: 'S01' },
      { productionOrderNumber: 'P002', mouldNumber: 'M001', productionDate: '2026-01-01', scheduleId: 'S02' },
    ];
    const result = await checkSchedulingConflicts(items);
    expect(result.batchConflicts).toEqual([]);
  });

  it('当无模具和设备分配时不应报任何冲突', async () => {
    const items = [
      { productionOrderNumber: 'P001' },
      { productionOrderNumber: 'P002' },
    ];
    const result = await checkSchedulingConflicts(items);
    expect(result.batchConflicts).toEqual([]);
    expect(result.dbConflicts).toEqual([]);
  });
});
