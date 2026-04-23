import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sequelize — factory must be self-contained (hoisted before variable init)
vi.mock('@/config/database', () => ({
  default: { query: vi.fn() },
}));

// Mock other dependencies that are not under test
vi.mock('@/services/documentNumber.service', () => ({
  generateWRNumber: vi.fn().mockResolvedValue('WR-20260421-001'),
}));
vi.mock('@/services/linesideMovement.service', () => ({
  logWorkReportLinesideMovement: vi.fn().mockResolvedValue(undefined),
  logWorkReportReverseLinesideMovement: vi.fn().mockResolvedValue(undefined),
}));

import { syncTaskCompletion } from '@/services/workReport.service';
import sequelize from '@/config/database';

// Reference the mock function after module import
const queryFn = sequelize.query as ReturnType<typeof vi.fn>;

/** Helper: find all SQL strings that were passed to queryFn */
const getSqlCalls = () => queryFn.mock.calls.map(call => call[0] as string);

/** Helper: check if any query SQL contains the given substring */
const hasSqlContaining = (substr: string) => getSqlCalls().some(sql => sql.includes(substr));

describe('syncTaskCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do nothing when taskNo is empty', async () => {
    await syncTaskCompletion('', 10);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('should do nothing when qtyDelta is 0', async () => {
    await syncTaskCompletion('PT-001', 0);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('should update completed_quantity and set status to 已完成 when completed >= planned', async () => {
    queryFn
      .mockResolvedValueOnce([[], 1]) // UPDATE qty
      .mockResolvedValueOnce([[{ task_status: '进行中', completed_quantity: '100', planned_quantity: '100' }]]) // SELECT task
      .mockResolvedValueOnce([[], 1]) // UPDATE status
      .mockResolvedValueOnce([[{ production_order_number: 'P-001' }]]) // SELECT order
      .mockResolvedValueOnce([[], 1]) // UPDATE plan_status
      .mockResolvedValueOnce([[{ cnt: 0 }]]) // SELECT pending
      .mockResolvedValueOnce([[], 1]); // UPDATE plan_status to 已完成

    await syncTaskCompletion('PT-001', 50);

    // Should have the status update to 已完成
    expect(hasSqlContaining("task_status = N'已完成'")).toBe(true);
  });

  it('should set status to 进行中 when 0 < completed < planned and status is 未开始', async () => {
    queryFn
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ task_status: '未开始', completed_quantity: '50', planned_quantity: '100' }]])
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ production_order_number: 'P-001' }]])
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ cnt: 1 }]]);

    await syncTaskCompletion('PT-001', 50);

    expect(hasSqlContaining("task_status = N'进行中'")).toBe(true);
  });

  it('should set status to 未开始 when completed <= 0 and not 已关闭', async () => {
    queryFn
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ task_status: '进行中', completed_quantity: '0', planned_quantity: '100' }]])
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ production_order_number: 'P-001' }]])
      .mockResolvedValueOnce([[{ cnt: 1 }]]);

    await syncTaskCompletion('PT-001', -50);

    expect(hasSqlContaining("task_status = N'未开始'")).toBe(true);
  });

  it('should NOT update task_status when status is 进行中 and 0 < completed < planned', async () => {
    queryFn
      .mockResolvedValueOnce([[], 1]) // UPDATE qty
      .mockResolvedValueOnce([[{ task_status: '进行中', completed_quantity: '50', planned_quantity: '100' }]]) // SELECT
      .mockResolvedValueOnce([[{ production_order_number: 'P-001' }]]) // SELECT order (plan_status flow)
      .mockResolvedValueOnce([[], 1]) // UPDATE plan_status
      .mockResolvedValueOnce([[{ cnt: 1 }]]); // SELECT pending

    await syncTaskCompletion('PT-001', 50);

    // Should have the qty UPDATE but NOT a task_status UPDATE
    expect(hasSqlContaining('completed_quantity')).toBe(true);
    expect(hasSqlContaining("task_status = N'已完成'")).toBe(false);
    expect(hasSqlContaining("task_status = N'进行中'")).toBe(false);
    expect(hasSqlContaining("task_status = N'未开始'")).toBe(false);
  });

  it('should NOT update task_status when task is 已关闭', async () => {
    queryFn
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ task_status: '已关闭', completed_quantity: '0', planned_quantity: '100' }]])
      .mockResolvedValueOnce([[{ production_order_number: 'P-001' }]])
      .mockResolvedValueOnce([[{ cnt: 1 }]]);

    await syncTaskCompletion('PT-001', -100);

    // 已关闭 is excluded from all status conditions
    expect(hasSqlContaining("task_status = N'已完成'")).toBe(false);
    expect(hasSqlContaining("task_status = N'进行中'")).toBe(false);
    expect(hasSqlContaining("task_status = N'未开始'")).toBe(false);
  });

  it('should pass transaction option to all queries when provided', async () => {
    const mockTx = { id: 'tx-1' };
    queryFn
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ task_status: '进行中', completed_quantity: '50', planned_quantity: '100' }]])
      .mockResolvedValueOnce([[{ production_order_number: 'P-001' }]])
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ cnt: 1 }]]);

    await syncTaskCompletion('PT-001', 50, mockTx);

    // All query calls should include transaction
    for (const call of queryFn.mock.calls) {
      if (call[1] && typeof call[1] === 'object') {
        expect(call[1]).toHaveProperty('transaction', mockTx);
      }
    }
  });

  it('should not make status or order flow queries when task not found after UPDATE', async () => {
    // Return empty rows from the SELECT — function should exit after the return check
    queryFn
      .mockResolvedValueOnce([[], 1]) // UPDATE qty
      .mockResolvedValueOnce([[]]); // SELECT returns empty → early return

    await syncTaskCompletion('PT-NONEXIST', 50);

    // Should NOT make any UPDATE on task_status or any production_order queries
    expect(hasSqlContaining("SET task_status")).toBe(false);
    expect(hasSqlContaining('production_order')).toBe(false);
  });
});
