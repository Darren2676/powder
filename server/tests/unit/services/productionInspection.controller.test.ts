import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ──── Module Mocks (hoisted) ────
vi.mock('@/config/database', () => ({
  default: { query: vi.fn(), transaction: vi.fn() },
}));
vi.mock('@/utils/response.util', () => ({
  success: vi.fn((data: any, msg: string) => ({ success: true, data, message: msg })),
}));
vi.mock('@/utils/excel.util', () => ({
  exportToExcel: vi.fn(),
}));

import {
  getProductionInspections,
  getProductionInspectionDetail,
  getInspectionsByOrder,
  updateProductionInspection,
  completeInspection,
  defectHandling,
  exportProductionInspections,
  createInspectionFromWorkReport,
} from '@/modules/quality/productionInspection/productionInspection.controller';
import sequelize from '@/config/database';
import { exportToExcel } from '@/utils/excel.util';

const queryFn = sequelize.query as ReturnType<typeof vi.fn>;
const transactionFn = (sequelize as any).transaction as ReturnType<typeof vi.fn>;

// ──── Helpers ────
function mockReq(overrides: any = {}) {
  return { params: {}, query: {}, body: {}, user: { username: 'admin' }, ...overrides } as any;
}
function mockRes() {
  const r: any = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  return r;
}
function mockTx() {
  return { commit: vi.fn(), rollback: vi.fn() };
}

describe('productionInspection.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-23T10:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  // ──────────────── getProductionInspections ────────────────
  describe('getProductionInspections', () => {
    it('should return paginated list with defaults', async () => {
      const rows = [{ inspection_number: 'QI-20260423-001', _row_num: 1 }];
      queryFn
        .mockResolvedValueOnce([[{ total: 1 }]])   // count
        .mockResolvedValueOnce([rows]);              // items
      const req = mockReq({ query: {} });
      const res = mockRes();
      await getProductionInspections(req, res, vi.fn());
      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          items: [{ inspection_number: 'QI-20260423-001' }], // _row_num stripped
          pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      }));
    });

    it('should apply search filter', async () => {
      queryFn
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);
      const req = mockReq({ query: { search: 'QI-2026', page: '1', limit: '10' } });
      const res = mockRes();
      await getProductionInspections(req, res, vi.fn());
      const countCall = queryFn.mock.calls[0];
      expect(countCall[0]).toContain('LIKE :search');
      expect(countCall[1].replacements.search).toBe('%QI-2026%');
    });

    it('should apply inspect_type / inspection_result / status filters', async () => {
      queryFn
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);
      const req = mockReq({ query: { inspect_type: '自检', inspection_result: '不合格', status: '已完成' } });
      const res = mockRes();
      await getProductionInspections(req, res, vi.fn());
      const sql = queryFn.mock.calls[0][0] as string;
      expect(sql).toContain('inspect_type = :inspect_type');
      expect(sql).toContain('inspection_result = :inspection_result');
      expect(sql).toContain('status = :status');
    });

    it('should call next on error', async () => {
      const err = new Error('db error');
      queryFn.mockRejectedValueOnce(err);
      const next = vi.fn();
      await getProductionInspections(mockReq(), mockRes(), next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ──────────────── getProductionInspectionDetail ────────────────
  describe('getProductionInspectionDetail', () => {
    it('should return record with items', async () => {
      const record = { inspection_number: 'QI-001', status: '待检' };
      const items = [{ id: 1, char_name: '外径' }];
      queryFn
        .mockResolvedValueOnce([[record]])
        .mockResolvedValueOnce([items]);
      const req = mockReq({ params: { id: 'QI-001' } });
      const res = mockRes();
      await getProductionInspectionDetail(req, res, vi.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: { ...record, items },
      }));
    });

    it('should return 404 if not found', async () => {
      queryFn.mockResolvedValueOnce([[]]);
      const res = mockRes();
      await getProductionInspectionDetail(mockReq({ params: { id: 'X' } }), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '检验记录不存在' }));
    });
  });

  // ──────────────── getInspectionsByOrder ────────────────
  describe('getInspectionsByOrder', () => {
    it('should return inspections for given order number', async () => {
      const rows = [{ inspection_number: 'QI-001' }, { inspection_number: 'QI-002' }];
      queryFn.mockResolvedValueOnce([rows]);
      const req = mockReq({ params: { orderNo: 'P20260407006' } });
      const res = mockRes();
      await getInspectionsByOrder(req, res, vi.fn());
      expect(queryFn.mock.calls[0][1].replacements.orderNo).toBe('P20260407006');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: rows }));
    });
  });

  // ──────────────── updateProductionInspection ────────────────
  describe('updateProductionInspection', () => {
    it('should update main record and items', async () => {
      const tx = mockTx();
      queryFn.mockResolvedValueOnce([[{ status: '待检' }]]);  // status check
      transactionFn.mockResolvedValueOnce(tx);
      queryFn.mockResolvedValueOnce([]);  // UPDATE production_inspection
      queryFn.mockResolvedValueOnce([]);  // UPDATE production_inspection_item

      const req = mockReq({
        params: { id: 'QI-001' },
        body: {
          qualified_quantity: 3, unqualified_quantity: 2,
          inspector_number: 'E001', inspector_name: '张三',
          items: [{ id: 1, actual_value: '5.1', item_result: '合格' }],
        },
      });
      const res = mockRes();
      await updateProductionInspection(req, res, vi.fn());
      expect(tx.commit).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '更新检验记录成功' }));
    });

    it('should skip items without id', async () => {
      const tx = mockTx();
      queryFn.mockResolvedValueOnce([[{ status: '待检' }]]);
      transactionFn.mockResolvedValueOnce(tx);
      queryFn.mockResolvedValueOnce([]);  // UPDATE production_inspection only

      const req = mockReq({
        params: { id: 'QI-001' },
        body: { qualified_quantity: 5, items: [{ actual_value: '5.1' }] },  // no id
      });
      const res = mockRes();
      await updateProductionInspection(req, res, vi.fn());
      // Only 1 query after transaction (main UPDATE), no item UPDATE
      const updateItemCalls = queryFn.mock.calls.filter(
        (c: any) => (c[0] as string).includes('UPDATE production_inspection_item')
      );
      expect(updateItemCalls).toHaveLength(0);
      expect(tx.commit).toHaveBeenCalled();
    });

    it('should rollback and call next when update fails inside transaction', async () => {
      const tx = mockTx();
      queryFn.mockResolvedValueOnce([[{ status: '待检' }]]);
      transactionFn.mockResolvedValueOnce(tx);
      const err = new Error('UPDATE failed');
      queryFn.mockRejectedValueOnce(err);  // UPDATE 失败

      const next = vi.fn();
      await updateProductionInspection(mockReq({ params: { id: 'QI-001' }, body: { items: [] } }), mockRes(), next);
      expect(tx.rollback).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(err);
    });

    it('should return 404 when record not found', async () => {
      queryFn.mockResolvedValueOnce([[]]);
      const res = mockRes();
      await updateProductionInspection(mockReq({ params: { id: 'X' }, body: {} }), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 403 when record already completed', async () => {
      queryFn.mockResolvedValueOnce([[{ status: '已完成' }]]);
      const res = mockRes();
      await updateProductionInspection(mockReq({ params: { id: 'QI-001' }, body: {} }), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '已完成的检验记录不允许修改' }));
    });
  });

  // ──────────────── completeInspection ────────────────
  describe('completeInspection', () => {
    it('should judge 不合格 when unqualified > 0', async () => {
      queryFn
        .mockResolvedValueOnce([[{ inspection_number: 'QI-001', status: '检验中', qualified_quantity: 3, unqualified_quantity: 2, total_quantity: 5 }]])
        .mockResolvedValueOnce([]);
      const res = mockRes();
      await completeInspection(mockReq({ params: { id: 'QI-001' } }), res, vi.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: { inspection_result: '不合格' },
      }));
    });

    it('should judge 合格 when unqualified = 0', async () => {
      queryFn
        .mockResolvedValueOnce([[{ inspection_number: 'QI-001', status: '检验中', qualified_quantity: 5, unqualified_quantity: 0, total_quantity: 5 }]])
        .mockResolvedValueOnce([]);
      const res = mockRes();
      await completeInspection(mockReq({ params: { id: 'QI-001' } }), res, vi.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: { inspection_result: '合格' },
      }));
    });

    it('should judge 合格 when both quantities are 0 (boundary: unfilled)', async () => {
      queryFn
        .mockResolvedValueOnce([[{ inspection_number: 'QI-001', status: '检验中', qualified_quantity: 0, unqualified_quantity: 0, total_quantity: 100 }]])
        .mockResolvedValueOnce([]);
      const res = mockRes();
      await completeInspection(mockReq({ params: { id: 'QI-001' } }), res, vi.fn());
      // When both are 0, unqualifiedQty is NOT > 0, so result is '合格'
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: { inspection_result: '合格' },
      }));
    });

    it('should handle null quantities gracefully (parseFloat fallback)', async () => {
      queryFn
        .mockResolvedValueOnce([[{ inspection_number: 'QI-001', status: '检验中', qualified_quantity: null, unqualified_quantity: null, total_quantity: null }]])
        .mockResolvedValueOnce([]);
      const res = mockRes();
      await completeInspection(mockReq({ params: { id: 'QI-001' } }), res, vi.fn());
      // parseFloat(null) => NaN, || 0 => 0, so result is '合格'
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: { inspection_result: '合格' },
      }));
    });

    it('should return 404 when not found', async () => {
      queryFn.mockResolvedValueOnce([[]]);
      const res = mockRes();
      await completeInspection(mockReq({ params: { id: 'X' } }), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 403 when already completed', async () => {
      queryFn.mockResolvedValueOnce([[{ status: '已完成' }]]);
      const res = mockRes();
      await completeInspection(mockReq({ params: { id: 'QI-001' } }), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '该检验记录已完成' }));
    });
  });

  // ──────────────── defectHandling ────────────────
  describe('defectHandling', () => {
    const baseRecord = {
      inspection_number: 'QI-001', inspection_result: '不合格', defect_handling: null,
      unqualified_quantity: 2, production_order_number: 'P20260407006',
      item_number: '110103', item_name: '密封件', specifications: 'Φ50',
    };

    // ── 返修 ──
    it('should handle 返修 and update target step quantity', async () => {
      const tx = mockTx();
      queryFn.mockResolvedValueOnce([[baseRecord]]);
      transactionFn.mockResolvedValueOnce(tx);
      queryFn.mockResolvedValueOnce([]);  // UPDATE process_task
      queryFn.mockResolvedValueOnce([]);  // UPDATE production_inspection

      const req = mockReq({
        params: { id: 'QI-001' },
        body: { defect_handling: '返修', rework_step_number: 10 },
      });
      const res = mockRes();
      await defectHandling(req, res, vi.fn());

      // query calls after transaction: update process_task + update production_inspection
      expect(queryFn).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE process_task'),
        expect.objectContaining({ replacements: expect.objectContaining({ qty: 2, step: 10 }) })
      );
      expect(tx.commit).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '不合格品处理完成：返修' }));
    });

    it('should reject 返修 without rework_step_number', async () => {
      const tx = mockTx();
      queryFn.mockResolvedValueOnce([[baseRecord]]);
      transactionFn.mockResolvedValueOnce(tx);

      const req = mockReq({ params: { id: 'QI-001' }, body: { defect_handling: '返修' } });
      const res = mockRes();
      await defectHandling(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '返修处理必须指定返修目标工序号' }));
      expect(tx.rollback).toHaveBeenCalled();
    });

    // ── 报废 ──
    it('should handle 报废 and create stock_in records', async () => {
      const tx = mockTx();
      queryFn.mockResolvedValueOnce([[baseRecord]]);          // select record
      transactionFn.mockResolvedValueOnce(tx);
      queryFn
        .mockResolvedValueOnce([[{ max_num: null }]])          // stock_in number gen
        .mockResolvedValueOnce([])                             // insert stock_in
        .mockResolvedValueOnce([])                             // insert stock_in_detail
        .mockResolvedValueOnce([]);                            // update production_inspection

      const req = mockReq({ params: { id: 'QI-001' }, body: { defect_handling: '报废' } });
      const res = mockRes();
      await defectHandling(req, res, vi.fn());

      // Verify stock_in INSERT
      const insertCall = queryFn.mock.calls.find((c: any) => (c[0] as string).includes('INSERT INTO stock_in ('));
      expect(insertCall).toBeDefined();
      expect(insertCall![1].replacements.stock_in_number).toBe('SI-20260423-001');

      // Verify stock_in_detail INSERT
      const detailCall = queryFn.mock.calls.find((c: any) => (c[0] as string).includes('INSERT INTO stock_in_detail'));
      expect(detailCall).toBeDefined();
      expect(detailCall![1].replacements.item_number).toBe('110103');

      expect(tx.commit).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '不合格品处理完成：报废' }));
    });

    it('should increment stock_in number when existing', async () => {
      const tx = mockTx();
      queryFn.mockResolvedValueOnce([[baseRecord]]);
      transactionFn.mockResolvedValueOnce(tx);
      queryFn
        .mockResolvedValueOnce([[{ max_num: 'SI-20260423-005' }]])  // existing max
        .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const req = mockReq({ params: { id: 'QI-001' }, body: { defect_handling: '报废' } });
      const res = mockRes();
      await defectHandling(req, res, vi.fn());

      const insertCall = queryFn.mock.calls.find((c: any) => (c[0] as string).includes('INSERT INTO stock_in ('));
      expect(insertCall![1].replacements.stock_in_number).toBe('SI-20260423-006');
    });

    // ── 让步接收 ──
    it('should handle 让步接收 and adjust quantities', async () => {
      const tx = mockTx();
      queryFn.mockResolvedValueOnce([[baseRecord]]);
      transactionFn.mockResolvedValueOnce(tx);
      queryFn.mockResolvedValueOnce([]);

      const req = mockReq({
        params: { id: 'QI-001' },
        body: { defect_handling: '让步接收', concession_quantity: 1 },
      });
      const res = mockRes();
      await defectHandling(req, res, vi.fn());

      expect(queryFn).toHaveBeenCalledWith(
        expect.stringContaining('让步接收'),
        expect.objectContaining({ replacements: expect.objectContaining({ concessionQty: 1 }) })
      );
      expect(tx.commit).toHaveBeenCalled();
    });

    it('should default concession_quantity to unqualifiedQty', async () => {
      const tx = mockTx();
      queryFn.mockResolvedValueOnce([[baseRecord]]);
      transactionFn.mockResolvedValueOnce(tx);
      queryFn.mockResolvedValueOnce([]);

      const req = mockReq({ params: { id: 'QI-001' }, body: { defect_handling: '让步接收' } });
      const res = mockRes();
      await defectHandling(req, res, vi.fn());

      expect(queryFn).toHaveBeenCalledWith(
        expect.stringContaining('让步接收'),
        expect.objectContaining({ replacements: expect.objectContaining({ concessionQty: 2 }) })
      );
    });

    it('should handle 让步接收 when concession_quantity > unqualified (SQL CASE protection)', async () => {
      const tx = mockTx();
      queryFn.mockResolvedValueOnce([[baseRecord]]);  // unqualified_quantity = 2
      transactionFn.mockResolvedValueOnce(tx);
      queryFn.mockResolvedValueOnce([]);

      const req = mockReq({
        params: { id: 'QI-001' },
        body: { defect_handling: '让步接收', concession_quantity: 5 },  // > 2
      });
      const res = mockRes();
      await defectHandling(req, res, vi.fn());

      // Should pass concessionQty=5 to SQL, SQL CASE WHEN handles negative protection
      expect(queryFn).toHaveBeenCalledWith(
        expect.stringContaining('CASE WHEN'),
        expect.objectContaining({ replacements: expect.objectContaining({ concessionQty: 5 }) })
      );
      expect(tx.commit).toHaveBeenCalled();
    });

    // ── Guard: transaction rollback on internal error ──
    it('should rollback and call next on transaction error', async () => {
      const tx = mockTx();
      queryFn.mockResolvedValueOnce([[baseRecord]]);
      transactionFn.mockResolvedValueOnce(tx);
      const err = new Error('DB crash');
      queryFn.mockRejectedValueOnce(err);

      const next = vi.fn();
      await defectHandling(mockReq({ params: { id: 'QI-001' }, body: { defect_handling: '返修', rework_step_number: 10 } }), mockRes(), next);
      expect(tx.rollback).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(err);
    });

    // ── Guard: only 不合格 can be handled ──
    it('should reject when inspection_result is not 不合格', async () => {
      queryFn.mockResolvedValueOnce([[{ ...baseRecord, inspection_result: '合格' }]]);
      const res = mockRes();
      await defectHandling(mockReq({ params: { id: 'QI-001' }, body: { defect_handling: '返修' } }), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '仅不合格的检验记录可进行不合格品处理' }));
    });

    // ── Guard: duplicate handling ──
    it('should reject duplicate handling', async () => {
      queryFn.mockResolvedValueOnce([[{ ...baseRecord, defect_handling: '返修' }]]);
      const res = mockRes();
      await defectHandling(mockReq({ params: { id: 'QI-001' }, body: { defect_handling: '报废' } }), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('不可重复操作'),
      }));
    });

    // ── Guard: invalid handling type ──
    it('should reject invalid handling type', async () => {
      const tx = mockTx();
      queryFn.mockResolvedValueOnce([[baseRecord]]);
      transactionFn.mockResolvedValueOnce(tx);

      const req = mockReq({ params: { id: 'QI-001' }, body: { defect_handling: '退货' } });
      const res = mockRes();
      await defectHandling(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(400);
      expect(tx.rollback).toHaveBeenCalled();
    });

    // ── Guard: not found ──
    it('should return 404 when record not found', async () => {
      queryFn.mockResolvedValueOnce([[]]);
      const res = mockRes();
      await defectHandling(mockReq({ params: { id: 'X' }, body: {} }), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ──────────────── createInspectionFromWorkReport ────────────────
  describe('createInspectionFromWorkReport', () => {
    const baseParams = {
      work_report_number: 'WR-001',
      process_task_number: 'PT-001',
      production_order_number: 'P001',
      step_number: 30,
      standard_process_name: '卷边',
      item_number: '110103',
      item_name: '密封件',
      specifications: 'Φ50',
      inspect_type: '自检',
      inspection_plan_name: '',
      inspection_spec_name: '',
      total_quantity: 5,
      creation_man: 'admin',
    };

    it('should generate QI number and insert record', async () => {
      queryFn
        .mockResolvedValueOnce([[{ max_num: null }]])  // number gen
        .mockResolvedValueOnce([]);                     // insert
      const num = await createInspectionFromWorkReport(baseParams);
      expect(num).toBe('QI-20260423-001');
      expect(queryFn).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO production_inspection'),
        expect.objectContaining({
          replacements: expect.objectContaining({
            inspection_number: 'QI-20260423-001',
            inspect_type: '自检',
            total_quantity: 5,
          }),
        })
      );
    });

    it('should increment number from existing max', async () => {
      queryFn
        .mockResolvedValueOnce([[{ max_num: 'QI-20260423-007' }]])
        .mockResolvedValueOnce([]);
      const num = await createInspectionFromWorkReport(baseParams);
      expect(num).toBe('QI-20260423-008');
    });

    it('should copy spec items when inspection_spec_name provided', async () => {
      const specItems = [
        { char_name: '外径', inspect_requirement: '卡尺', data_type: '数值', upper_limit: 51, standard_value: 50, lower_limit: 49, sort_order: 1 },
        { char_name: '硬度', inspect_requirement: '硬度计', data_type: '数值', upper_limit: 72, standard_value: 70, lower_limit: 68, sort_order: 2 },
      ];
      queryFn
        .mockResolvedValueOnce([[{ max_num: null }]])  // number gen
        .mockResolvedValueOnce([])                      // insert main
        .mockResolvedValueOnce([specItems])              // select spec items
        .mockResolvedValueOnce([])                      // insert item 1
        .mockResolvedValueOnce([]);                     // insert item 2

      const num = await createInspectionFromWorkReport({
        ...baseParams,
        inspection_spec_name: 'SPEC-001',
      });
      expect(num).toBe('QI-20260423-001');
      // Verify spec items query
      expect(queryFn).toHaveBeenCalledWith(
        expect.stringContaining('FROM inspection_spec_item'),
        expect.objectContaining({ replacements: { specName: 'SPEC-001' } })
      );
      // Two item inserts
      const insertItemCalls = queryFn.mock.calls.filter(
        (c: any) => (c[0] as string).includes('INSERT INTO production_inspection_item')
      );
      expect(insertItemCalls).toHaveLength(2);
    });

    it('should use transaction when provided', async () => {
      const tx = { id: 'tx-1' };
      queryFn
        .mockResolvedValueOnce([[{ max_num: null }]])
        .mockResolvedValueOnce([]);
      await createInspectionFromWorkReport(baseParams, tx);
      expect(queryFn.mock.calls[0][1]).toHaveProperty('transaction', tx);
      expect(queryFn.mock.calls[1][1]).toHaveProperty('transaction', tx);
    });
  });

  // ──────────────── exportProductionInspections ────────────────
  describe('exportProductionInspections', () => {
    const expectedFields = ['inspection_number', 'work_report_number', 'process_task_number', 'production_order_number', 'step_number', 'standard_process_name', 'item_number', 'item_name', 'inspect_type', 'inspection_plan_name', 'inspection_spec_name', 'total_quantity', 'qualified_quantity', 'unqualified_quantity', 'inspection_result', 'inspector_name', 'inspection_date', 'defect_handling', 'status', 'remark'];
    const expectedHeaders = ['检验单号', '报工单号', '工序任务号', '生产单号', '工序序号', '工序名称', '产品编号', '产品名称', '检验类型', '检验方案', '检验规范', '送检数量', '合格数量', '不合格数量', '检验结果', '检验员', '检验日期', '不合格处理', '状态', '备注'];

    it('should call exportToExcel with all 20 fields and headers in correct order', async () => {
      const rows = [{ inspection_number: 'QI-001' }];
      queryFn.mockResolvedValueOnce([rows]);
      const res = mockRes();
      await exportProductionInspections(mockReq(), res, vi.fn());
      expect(exportToExcel).toHaveBeenCalledWith(
        rows,
        expectedFields,
        expectedHeaders,
        'production_inspections',
        res
      );
    });

    it('should ensure fields and headers have same length (20)', () => {
      expect(expectedFields).toHaveLength(20);
      expect(expectedHeaders).toHaveLength(20);
    });
  });
});
