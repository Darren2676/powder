/**
 * 工序任务状态同步 - 单元测试
 * 测试 syncTaskCompletion 的核心逻辑（纯函数测试，需 mock 数据库）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sequelize - 必须在工厂函数内部创建 mock，因为 vi.mock 会被提升
vi.mock('@/config/database', () => ({
  default: { query: vi.fn() },
}));

vi.mock('@/services/salesOrderSync.service', () => ({
  syncProductionStatus: vi.fn().mockResolvedValue(undefined),
}));

import sequelize from '@/config/database';
import { syncTaskCompletion } from './taskSync';

const mockQuery = sequelize.query as ReturnType<typeof vi.fn>;

describe('syncTaskCompletion', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('当 taskNo 为空时应直接返回', async () => {
    await syncTaskCompletion('', 10);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('当 qtyDelta 为 0 时应直接返回', async () => {
    await syncTaskCompletion('PT001', 0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('当完成任务数 >= 计划数时应标记为已完成', async () => {
    // UPDATE completed_quantity
    mockQuery.mockResolvedValueOnce([[], 1]);
    // SELECT task status
    mockQuery.mockResolvedValueOnce([[{
      task_status: '进行中',
      completed_quantity: 100,
      planned_quantity: 100,
    }]]);
    // UPDATE task_status = 已完成
    mockQuery.mockResolvedValueOnce([[], 1]);
    // SELECT production_order_number
    mockQuery.mockResolvedValueOnce([[{ production_order_number: 'PO001' }]]);
    // UPDATE plan_status = 生产中
    mockQuery.mockResolvedValueOnce([[], 1]);
    // SELECT pending tasks
    mockQuery.mockResolvedValueOnce([[{ cnt: 1 }]]);
    // SELECT pending inspect
    mockQuery.mockResolvedValueOnce([[{ cnt: 0 }]]);

    await syncTaskCompletion('PT001', 50);
    expect(mockQuery).toHaveBeenCalled();
  });

  it('当查询无结果时应安全返回', async () => {
    // UPDATE completed_quantity
    mockQuery.mockResolvedValueOnce([[], 1]);
    // SELECT task status - 空结果
    mockQuery.mockResolvedValueOnce([[]]);

    await syncTaskCompletion('PT-NONEXIST', 10);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('当完成数量 > 0 且 < 计划数且状态为未开始时应标记为进行中', async () => {
    // UPDATE completed_quantity
    mockQuery.mockResolvedValueOnce([[], 1]);
    // SELECT task status
    mockQuery.mockResolvedValueOnce([[{
      task_status: '未开始',
      completed_quantity: 30,
      planned_quantity: 100,
    }]]);
    // UPDATE task_status = 进行中
    mockQuery.mockResolvedValueOnce([[], 1]);
    // SELECT production_order_number
    mockQuery.mockResolvedValueOnce([[{ production_order_number: 'PO001' }]]);
    // UPDATE plan_status
    mockQuery.mockResolvedValueOnce([[], 1]);
    // SELECT pending tasks
    mockQuery.mockResolvedValueOnce([[{ cnt: 1 }]]);
    // SELECT pending inspect
    mockQuery.mockResolvedValueOnce([[{ cnt: 0 }]]);

    await syncTaskCompletion('PT001', 30, {} as any);
  });

  it('当完成数量 <= 0 且状态非已关闭时应标记为未开始', async () => {
    // UPDATE completed_quantity
    mockQuery.mockResolvedValueOnce([[], 1]);
    // SELECT task status
    mockQuery.mockResolvedValueOnce([[{
      task_status: '进行中',
      completed_quantity: 0,
      planned_quantity: 100,
    }]]);
    // UPDATE task_status = 未开始
    mockQuery.mockResolvedValueOnce([[], 1]);
    // SELECT production_order_number
    mockQuery.mockResolvedValueOnce([[{ production_order_number: 'PO001' }]]);

    await syncTaskCompletion('PT001', -30, {} as any);
  });
});
