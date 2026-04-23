import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ──── Module Mocks (hoisted) ────
vi.mock('@/config/database', () => ({
  default: { query: vi.fn(), transaction: vi.fn() },
}));
vi.mock('@/utils/response.util', () => ({
  success: vi.fn((data: any = null, message: string = '成功') => ({ success: true, message, data })),
}));

import {
  createInspectionForStockIn,
  createPurchaseInspection,
  getPurchaseInspections,
  getPurchaseInspectionDetail,
  updatePurchaseInspection,
  completePurchaseInspection,
  getPurchaseInspectionSummary,
  defectHandlingPurchaseInspection,
} from '@/modules/purchasing/purchaseInspection/purchaseInspection.controller';
import sequelize from '@/config/database';

const queryFn = sequelize.query as ReturnType<typeof vi.fn>;
const transactionFn = (sequelize as any).transaction as ReturnType<typeof vi.fn>;

// ──── Helpers ────
function mockReq(overrides: any = {}) {
  return { params: {}, query: {}, body: {}, user: { username: 'tester' }, ...overrides } as any;
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

describe('purchaseInspection.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-23T10:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  // ══════════════ createInspectionForStockIn ══════════════
  describe('createInspectionForStockIn', () => {
    const baseParams = {
      stock_in_number: 'SI-001',
      purchase_order_number: 'PO-001',
      supplier_number: 'S001',
      supplier_name: '供应商A',
      item_number: 'MAT-001',
      item_name: '密封圈',
      specifications: '10x20',
      basic_unit: '个',
      received_quantity: 100,
      batch_number: 'B001',
      creation_man: 'admin',
    };

    it('should create inspection with matched plan and spec', async () => {
      queryFn
        .mockResolvedValueOnce([[]])                                // generateInspectionNumber: no existing
        .mockResolvedValueOnce([[{                                   // plan match
          plan_name: 'MAT-001', inspector_name: '张三',
          inspect_method: '全检', sampling_quantity: '10'
        }]])
        .mockResolvedValueOnce([[{ spec_name: 'MAT-001' }]])        // spec match
        .mockResolvedValueOnce([])                                   // INSERT main
        .mockResolvedValueOnce([[{                                   // spec items
          char_name: '外径', char_category: '尺寸', data_type: '计量型',
          upper_limit: 20.5, standard_value: 20, lower_limit: 19.5,
          inspect_requirement: '卡尺测量', sort_order: 1
        }]])
        .mockResolvedValueOnce([]);                                  // INSERT detail

      const result = await createInspectionForStockIn(baseParams);
      expect(result).toBe('QI-20260423-001');
      expect(queryFn).toHaveBeenCalledTimes(6);
      // Verify INSERT main contains correct replacements
      const insertCall = queryFn.mock.calls[3];
      expect(insertCall[0]).toContain('INSERT INTO purchase_quality_inspection');
      expect(insertCall[1].replacements.inspect_plan_name).toBe('MAT-001');
      expect(insertCall[1].replacements.sample_quantity).toBe(10);
      expect(insertCall[1].replacements.inspector_name).toBe('张三');
    });

    it('should create inspection without plan/spec match', async () => {
      queryFn
        .mockResolvedValueOnce([[]])   // no existing number
        .mockResolvedValueOnce([[]])   // no plan
        .mockResolvedValueOnce([[]])   // no spec
        .mockResolvedValueOnce([]);    // INSERT main only

      const result = await createInspectionForStockIn(baseParams);
      expect(result).toBe('QI-20260423-001');
      // No spec items → no detail insert → only 4 queries
      expect(queryFn).toHaveBeenCalledTimes(4);
    });

    it('should pass transaction to all queries when provided', async () => {
      const tx = mockTx();
      queryFn
        .mockResolvedValueOnce([[{ inspection_number: 'QI-20260423-005' }]]) // existing number
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([]);

      const result = await createInspectionForStockIn(baseParams, tx as any);
      expect(result).toBe('QI-20260423-006');
      // All 4 queries should include transaction
      for (let i = 0; i < 4; i++) {
        expect(queryFn.mock.calls[i][1]).toHaveProperty('transaction', tx);
      }
    });

    it('should increment sequence number from existing max', async () => {
      queryFn
        .mockResolvedValueOnce([[{ inspection_number: 'QI-20260423-099' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([]);

      const result = await createInspectionForStockIn(baseParams);
      expect(result).toBe('QI-20260423-100');
    });

    it('should use received_quantity as sample when plan has no sampling_quantity', async () => {
      queryFn
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{
          plan_name: 'MAT-001', inspector_name: '', inspect_method: '',
          sampling_quantity: '0'
        }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([]);

      await createInspectionForStockIn(baseParams);
      const insertCall = queryFn.mock.calls[3];
      expect(insertCall[1].replacements.sample_quantity).toBe(100);
    });

    it('should insert multiple spec detail rows via for loop', async () => {
      const specItems = [
        { char_name: '外径', char_category: '尺寸', data_type: '计量型', upper_limit: 20.5, standard_value: 20, lower_limit: 19.5, inspect_requirement: '卡尺', sort_order: 1 },
        { char_name: '硬度', char_category: '物理', data_type: '计量型', upper_limit: 75, standard_value: 70, lower_limit: 65, inspect_requirement: '硬度计', sort_order: 2 },
        { char_name: '外观', char_category: '外观', data_type: '计数型', upper_limit: null, standard_value: null, lower_limit: null, inspect_requirement: '目视', sort_order: 3 },
      ];
      queryFn
        .mockResolvedValueOnce([[]])                        // generateInspectionNumber
        .mockResolvedValueOnce([[{ plan_name: 'MAT-001' }]]) // plan
        .mockResolvedValueOnce([[{ spec_name: 'MAT-001' }]]) // spec
        .mockResolvedValueOnce([])                           // INSERT main
        .mockResolvedValueOnce([specItems])                  // spec items query
        .mockResolvedValueOnce([])                           // INSERT detail 1
        .mockResolvedValueOnce([])                           // INSERT detail 2
        .mockResolvedValueOnce([]);                          // INSERT detail 3

      await createInspectionForStockIn(baseParams);
      // 4 base queries + 1 spec items query + 3 detail inserts = 8
      expect(queryFn).toHaveBeenCalledTimes(8);
      // Verify each detail INSERT has correct char_name
      expect(queryFn.mock.calls[5][1].replacements.char_name).toBe('外径');
      expect(queryFn.mock.calls[6][1].replacements.char_name).toBe('硬度');
      expect(queryFn.mock.calls[7][1].replacements.char_name).toBe('外观');
    });
  });

  // ══════════════ createPurchaseInspection ══════════════
  describe('createPurchaseInspection', () => {
    it('should return 400 when item_number is missing', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      await createPurchaseInspection(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '物料编号不能为空' }));
    });

    it('should create inspection and return inspection_number', async () => {
      queryFn
        .mockResolvedValueOnce([[]])   // generateInspectionNumber
        .mockResolvedValueOnce([[]])   // plan
        .mockResolvedValueOnce([[]])   // spec
        .mockResolvedValueOnce([]);    // INSERT

      const req = mockReq({
        body: { item_number: 'MAT-001', item_name: '密封圈', received_quantity: 50 }
      });
      const res = mockRes();
      await createPurchaseInspection(req, res, vi.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({ inspection_number: 'QI-20260423-001' })
      }));
    });

    it('should call next on error', async () => {
      queryFn.mockRejectedValueOnce(new Error('DB error'));
      const req = mockReq({ body: { item_number: 'MAT-001' } });
      const res = mockRes();
      const next = vi.fn();
      await createPurchaseInspection(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ══════════════ getPurchaseInspections ══════════════
  describe('getPurchaseInspections', () => {
    it('should return paginated list with defaults', async () => {
      queryFn
        .mockResolvedValueOnce([[{ total: 2 }]])                    // count
        .mockResolvedValueOnce([[{ inspection_number: 'QI-001' }]]) // items
        .mockResolvedValueOnce([[{ total_count: 2, pass_rate: 95 }]]); // stats

      const req = mockReq({ query: {} });
      const res = mockRes();
      await getPurchaseInspections(req, res, vi.fn());
      expect(queryFn).toHaveBeenCalledTimes(3);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          items: [{ inspection_number: 'QI-001' }],
          total: 2,
          page: 1,
          limit: 20,
        })
      }));
    });

    it('should apply all search filters', async () => {
      queryFn
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{}]]);

      const req = mockReq({
        query: {
          search: 'QI-2026', supplier_number: 'S001',
          inspect_status: '待检验', start_date: '2026-01-01', end_date: '2026-12-31',
          page: '2', limit: '10'
        }
      });
      const res = mockRes();
      await getPurchaseInspections(req, res, vi.fn());
      const countSql = queryFn.mock.calls[0][0];
      expect(countSql).toContain('LIKE :search');
      expect(countSql).toContain('supplier_number = :supplier_number');
      expect(countSql).toContain('inspect_status = :inspect_status');
      expect(countSql).toContain('inspect_date >= :start_date');
      expect(countSql).toContain('inspect_date <= :end_date');
    });

    it('should call next on error', async () => {
      queryFn.mockRejectedValueOnce(new Error('DB'));
      const next = vi.fn();
      await getPurchaseInspections(mockReq({ query: {} }), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ══════════════ getPurchaseInspectionDetail ══════════════
  describe('getPurchaseInspectionDetail', () => {
    it('should return 404 when inspection not found', async () => {
      queryFn.mockResolvedValueOnce([[]]);
      const req = mockReq({ params: { inspection_number: 'QI-NOTFOUND' } });
      const res = mockRes();
      await getPurchaseInspectionDetail(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return header, details and options', async () => {
      queryFn
        .mockResolvedValueOnce([[{ inspection_number: 'QI-001', item_number: 'MAT-001' }]]) // header
        .mockResolvedValueOnce([[{ id: 1, char_name: '外径' }]])                             // details
        .mockResolvedValueOnce([[{ defect_class_name: '外观' }]])                            // defect classes
        .mockResolvedValueOnce([[{ defect_name: '划痕', defect_class_name: '外观' }]])       // defects
        .mockResolvedValueOnce([[{ defect_reason_name: '模具磨损' }]]);                      // reasons

      const req = mockReq({ params: { inspection_number: 'QI-001' } });
      const res = mockRes();
      await getPurchaseInspectionDetail(req, res, vi.fn());
      expect(queryFn).toHaveBeenCalledTimes(5);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          header: { inspection_number: 'QI-001', item_number: 'MAT-001' },
          details: [{ id: 1, char_name: '外径' }],
          options: {
            defect_classes: ['外观'],
            defects: [{ defect_name: '划痕', defect_class_name: '外观' }],
            defect_reasons: ['模具磨损']
          }
        })
      }));
    });

    it('should call next on error', async () => {
      queryFn.mockRejectedValueOnce(new Error('DB error'));
      const next = vi.fn();
      await getPurchaseInspectionDetail(mockReq({ params: { inspection_number: 'QI-001' } }), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ══════════════ updatePurchaseInspection ══════════════
  describe('updatePurchaseInspection', () => {
    it('should update header and detail rows', async () => {
      queryFn
        .mockResolvedValueOnce([])   // UPDATE header
        .mockResolvedValueOnce([]);  // UPDATE detail

      const req = mockReq({
        params: { inspection_number: 'QI-001' },
        body: {
          qualified_quantity: 90, unqualified_quantity: 10,
          inspect_result: '不合格',
          details: [{ id: 1, actual_value: '20.3', is_qualified: '是' }]
        }
      });
      const res = mockRes();
      await updatePurchaseInspection(req, res, vi.fn());
      expect(queryFn).toHaveBeenCalledTimes(2);
      const headerSql = queryFn.mock.calls[0][0];
      expect(headerSql).toContain("inspect_status = N'检验中'");
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: { message: '检验单更新成功' }
      }));
    });

    it('should skip detail items without id', async () => {
      queryFn.mockResolvedValueOnce([]); // UPDATE header only
      const req = mockReq({
        params: { inspection_number: 'QI-001' },
        body: {
          qualified_quantity: 100,
          details: [{ actual_value: '20.0' }, { id: null, actual_value: '19.5' }]
        }
      });
      const res = mockRes();
      await updatePurchaseInspection(req, res, vi.fn());
      // Only 1 query (header), no detail updates
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it('should handle empty details array', async () => {
      queryFn.mockResolvedValueOnce([]);
      const req = mockReq({
        params: { inspection_number: 'QI-001' },
        body: { qualified_quantity: 100, details: [] }
      });
      const res = mockRes();
      await updatePurchaseInspection(req, res, vi.fn());
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it('should call next on error', async () => {
      queryFn.mockRejectedValueOnce(new Error('DB error'));
      const next = vi.fn();
      await updatePurchaseInspection(mockReq({
        params: { inspection_number: 'QI-001' },
        body: { qualified_quantity: 100 }
      }), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ══════════════ completePurchaseInspection ══════════════
  describe('completePurchaseInspection', () => {
    it('should return 400 when inspect_result is missing', async () => {
      const req = mockReq({ params: { inspection_number: 'QI-001' }, body: {} });
      const res = mockRes();
      await completePurchaseInspection(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '检验结论不能为空' }));
    });

    it('should complete and writeback to stock_in_detail', async () => {
      queryFn
        .mockResolvedValueOnce([])   // UPDATE status
        .mockResolvedValueOnce([[{   // SELECT inspection
          stock_in_number: 'SI-001', item_number: 'MAT-001',
          qualified_quantity: 90, unqualified_quantity: 10
        }]])
        .mockResolvedValueOnce([]);  // UPDATE stock_in_detail

      const req = mockReq({
        params: { inspection_number: 'QI-001' },
        body: { inspect_result: '不合格', qualified_quantity: 90, unqualified_quantity: 10 }
      });
      const res = mockRes();
      await completePurchaseInspection(req, res, vi.fn());
      expect(queryFn).toHaveBeenCalledTimes(3);
      const writebackSql = queryFn.mock.calls[2][0];
      expect(writebackSql).toContain('UPDATE stock_in_detail');
    });

    it('should skip writeback when no stock_in_number', async () => {
      queryFn
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[{ stock_in_number: '', item_number: 'MAT-001' }]]);

      const req = mockReq({
        params: { inspection_number: 'QI-001' },
        body: { inspect_result: '合格', qualified_quantity: 100, unqualified_quantity: 0 }
      });
      const res = mockRes();
      await completePurchaseInspection(req, res, vi.fn());
      expect(queryFn).toHaveBeenCalledTimes(2); // no writeback
    });

    it('should call next on error', async () => {
      queryFn.mockRejectedValueOnce(new Error('DB error'));
      const next = vi.fn();
      await completePurchaseInspection(mockReq({
        params: { inspection_number: 'QI-001' },
        body: { inspect_result: '合格' }
      }), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle null quantities gracefully', async () => {
      queryFn
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[]]);

      const req = mockReq({
        params: { inspection_number: 'QI-001' },
        body: { inspect_result: '合格' }
      });
      const res = mockRes();
      await completePurchaseInspection(req, res, vi.fn());
      const updateCall = queryFn.mock.calls[0][1].replacements;
      expect(updateCall.qualified_quantity).toBe(0);
      expect(updateCall.unqualified_quantity).toBe(0);
      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ message: '检验完成' })
      }));
    });

    it('should still succeed when stock_in writeback fails (silent catch)', async () => {
      queryFn
        .mockResolvedValueOnce([])                                   // UPDATE status
        .mockResolvedValueOnce([[{
          stock_in_number: 'SI-001', item_number: 'MAT-001',
          qualified_quantity: 90, unqualified_quantity: 10
        }]])
        .mockRejectedValueOnce(new Error('stock_in_detail missing')); // writeback fails

      const req = mockReq({
        params: { inspection_number: 'QI-001' },
        body: { inspect_result: '不合格', qualified_quantity: 90, unqualified_quantity: 10 }
      });
      const res = mockRes();
      const next = vi.fn();
      await completePurchaseInspection(req, res, next);
      // Should still return success despite writeback failure
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ message: '检验完成' })
      }));
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ══════════════ getPurchaseInspectionSummary ══════════════
  describe('getPurchaseInspectionSummary', () => {
    it('should return summary with all sections', async () => {
      queryFn
        .mockResolvedValueOnce([[{ supplier_number: 'S001', pass_rate: 95 }]])  // by supplier
        .mockResolvedValueOnce([[{ item_number: 'MAT-001', pass_rate: 90 }]])   // by item
        .mockResolvedValueOnce([[{ total_inspections: 10, pass_rate: 92 }]]);   // overall

      const req = mockReq({ query: {} });
      const res = mockRes();
      await getPurchaseInspectionSummary(req, res, vi.fn());
      expect(queryFn).toHaveBeenCalledTimes(3);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          by_supplier: [{ supplier_number: 'S001', pass_rate: 95 }],
          by_item: [{ item_number: 'MAT-001', pass_rate: 90 }],
          overall: { total_inspections: 10, pass_rate: 92 }
        })
      }));
    });

    it('should apply date and supplier filters', async () => {
      queryFn
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{}]]);

      const req = mockReq({
        query: { start_date: '2026-01-01', end_date: '2026-12-31', supplier_number: 'S001' }
      });
      const res = mockRes();
      await getPurchaseInspectionSummary(req, res, vi.fn());
      const sql = queryFn.mock.calls[0][0];
      expect(sql).toContain('inspect_date >= :start_date');
      expect(sql).toContain('inspect_date <= :end_date');
      expect(sql).toContain('supplier_number = :supplier_number');
    });

    it('should call next on error', async () => {
      queryFn.mockRejectedValueOnce(new Error('DB error'));
      const next = vi.fn();
      await getPurchaseInspectionSummary(mockReq({ query: {} }), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ══════════════ defectHandlingPurchaseInspection ══════════════
  describe('defectHandlingPurchaseInspection', () => {
    it('should return 400 when defect_handling is empty', async () => {
      const req = mockReq({
        params: { inspection_number: 'QI-001' },
        body: { defect_handling: '' }
      });
      const res = mockRes();
      await defectHandlingPurchaseInspection(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '处理方式不能为空' }));
    });

    it('should return 400 for invalid defect_handling value', async () => {
      const req = mockReq({
        params: { inspection_number: 'QI-001' },
        body: { defect_handling: '无效方式' }
      });
      const res = mockRes();
      await defectHandlingPurchaseInspection(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('无效的处理方式')
      }));
    });

    it('should return 404 when inspection not found', async () => {
      queryFn.mockResolvedValueOnce([[]]);
      const req = mockReq({
        params: { inspection_number: 'QI-NOTFOUND' },
        body: { defect_handling: '挑选' }
      });
      const res = mockRes();
      await defectHandlingPurchaseInspection(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 when inspection is not completed', async () => {
      queryFn.mockResolvedValueOnce([[{ inspect_status: '检验中', defect_handling: '' }]]);
      const req = mockReq({
        params: { inspection_number: 'QI-001' },
        body: { defect_handling: '挑选' }
      });
      const res = mockRes();
      await defectHandlingPurchaseInspection(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('尚未完成')
      }));
    });

    it('should return 400 when already handled (防重入)', async () => {
      queryFn.mockResolvedValueOnce([[{
        inspect_status: '已完成', defect_handling: '拒收'
      }]]);
      const req = mockReq({
        params: { inspection_number: 'QI-001' },
        body: { defect_handling: '退货' }
      });
      const res = mockRes();
      await defectHandlingPurchaseInspection(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('已进行过不合格品处理')
      }));
    });

    it('should handle 挑选 with quantity adjustment and stock_in writeback', async () => {
      const tx = mockTx();
      transactionFn.mockResolvedValueOnce(tx);
      queryFn
        .mockResolvedValueOnce([[{                               // SELECT inspection
          inspection_number: 'QI-001', inspect_status: '已完成',
          defect_handling: '', stock_in_number: 'SI-001', item_number: 'MAT-001'
        }]])
        .mockResolvedValueOnce([])                                // UPDATE defect_handling
        .mockResolvedValueOnce([])                                // UPDATE quantities (挑选)
        .mockResolvedValueOnce([[{ qualified_quantity: 95, unqualified_quantity: 5 }]]) // re-SELECT
        .mockResolvedValueOnce([]);                               // UPDATE stock_in_detail

      const req = mockReq({
        params: { inspection_number: 'QI-001' },
        body: {
          defect_handling: '挑选',
          qualified_quantity: 95, unqualified_quantity: 5,
          handling_remark: '挑选合格品'
        }
      });
      const res = mockRes();
      await defectHandlingPurchaseInspection(req, res, vi.fn());

      expect(tx.commit).toHaveBeenCalled();
      expect(tx.rollback).not.toHaveBeenCalled();
      // Verify 挑选 UPDATE
      const pickSql = queryFn.mock.calls[2][0];
      expect(pickSql).toContain('qualified_quantity = :qualified_quantity');
      // Verify stock_in writeback
      const writebackSql = queryFn.mock.calls[4][0];
      expect(writebackSql).toContain('UPDATE stock_in_detail');
      expect(writebackSql).toContain('inspect_status = :inspect_status');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: { message: '不合格品处理完成（挑选）' }
      }));
    });

    it('should handle 特采 with incremental quantity and 让步接收 result', async () => {
      const tx = mockTx();
      transactionFn.mockResolvedValueOnce(tx);
      queryFn
        .mockResolvedValueOnce([[{
          inspection_number: 'QI-002', inspect_status: '已完成',
          defect_handling: '', stock_in_number: '', item_number: 'MAT-002'
        }]])
        .mockResolvedValueOnce([])                                // UPDATE defect_handling
        .mockResolvedValueOnce([]);                               // UPDATE 特采 incremental

      const req = mockReq({
        params: { inspection_number: 'QI-002' },
        body: {
          defect_handling: '特采',
          handling_quantity: 15,
          special_warehouse: '特采仓'
        }
      });
      const res = mockRes();
      await defectHandlingPurchaseInspection(req, res, vi.fn());

      expect(tx.commit).toHaveBeenCalled();
      const specialSql = queryFn.mock.calls[2][0];
      expect(specialSql).toContain('qualified_quantity = qualified_quantity + :handlingQty');
      expect(specialSql).toContain("inspect_result = N'让步接收'");
      expect(queryFn.mock.calls[2][1].replacements.handlingQty).toBe(15);
      // No stock_in writeback (no stock_in_number)
      expect(queryFn).toHaveBeenCalledTimes(3);
    });

    it('should handle 拒收 without extra quantity SQL', async () => {
      const tx = mockTx();
      transactionFn.mockResolvedValueOnce(tx);
      queryFn
        .mockResolvedValueOnce([[{
          inspection_number: 'QI-003', inspect_status: '已完成',
          defect_handling: '', stock_in_number: '', item_number: 'MAT-003'
        }]])
        .mockResolvedValueOnce([]);                               // UPDATE defect_handling only

      const req = mockReq({
        params: { inspection_number: 'QI-003' },
        body: { defect_handling: '拒收', handling_remark: '质量不达标' }
      });
      const res = mockRes();
      await defectHandlingPurchaseInspection(req, res, vi.fn());

      expect(tx.commit).toHaveBeenCalled();
      // 拒收: only 2 queries (SELECT + UPDATE defect_handling), no quantity adjustment, no writeback
      expect(queryFn).toHaveBeenCalledTimes(2);
    });

    it('should handle 报废 normal flow with stock_in writeback', async () => {
      const tx = mockTx();
      transactionFn.mockResolvedValueOnce(tx);
      queryFn
        .mockResolvedValueOnce([[{
          inspection_number: 'QI-007', inspect_status: '已完成',
          defect_handling: '', stock_in_number: 'SI-007', item_number: 'MAT-007'
        }]])
        .mockResolvedValueOnce([])                                // UPDATE defect_handling
        .mockResolvedValueOnce([[{ qualified_quantity: 70, unqualified_quantity: 30 }]]) // re-SELECT
        .mockResolvedValueOnce([]);                               // UPDATE stock_in_detail

      const req = mockReq({
        params: { inspection_number: 'QI-007' },
        body: { defect_handling: '报废', handling_quantity: 30, handling_remark: '整批报废' }
      });
      const res = mockRes();
      await defectHandlingPurchaseInspection(req, res, vi.fn());

      expect(tx.commit).toHaveBeenCalled();
      expect(queryFn).toHaveBeenCalledTimes(4);
      // Verify defect_handling value
      expect(queryFn.mock.calls[1][1].replacements.defect_handling).toBe('报废');
      // Verify writeback inspect_status
      expect(queryFn.mock.calls[3][1].replacements.inspect_status).toBe('已处理-报废');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: { message: '不合格品处理完成（报废）' }
      }));
    });

    it('should handle 特采 with zero handling_quantity (no incremental update)', async () => {
      const tx = mockTx();
      transactionFn.mockResolvedValueOnce(tx);
      queryFn
        .mockResolvedValueOnce([[{
          inspection_number: 'QI-004', inspect_status: '已完成',
          defect_handling: '', stock_in_number: '', item_number: 'MAT-004'
        }]])
        .mockResolvedValueOnce([]);                               // UPDATE defect_handling

      const req = mockReq({
        params: { inspection_number: 'QI-004' },
        body: { defect_handling: '特采', handling_quantity: 0 }
      });
      const res = mockRes();
      await defectHandlingPurchaseInspection(req, res, vi.fn());

      expect(tx.commit).toHaveBeenCalled();
      // 特采 with 0 quantity: skips incremental update
      expect(queryFn).toHaveBeenCalledTimes(2);
    });

    it('should rollback transaction on error', async () => {
      const tx = mockTx();
      transactionFn.mockResolvedValueOnce(tx);
      queryFn
        .mockResolvedValueOnce([[{
          inspection_number: 'QI-005', inspect_status: '已完成',
          defect_handling: '', stock_in_number: 'SI-005', item_number: 'MAT-005'
        }]])
        .mockRejectedValueOnce(new Error('DB write error')); // UPDATE fails

      const req = mockReq({
        params: { inspection_number: 'QI-005' },
        body: { defect_handling: '报废', handling_quantity: 10 }
      });
      const res = mockRes();
      const next = vi.fn();
      await defectHandlingPurchaseInspection(req, res, next);

      expect(tx.rollback).toHaveBeenCalled();
      expect(tx.commit).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle 退货 with return_order_number', async () => {
      const tx = mockTx();
      transactionFn.mockResolvedValueOnce(tx);
      queryFn
        .mockResolvedValueOnce([[{
          inspection_number: 'QI-006', inspect_status: '已完成',
          defect_handling: '', stock_in_number: 'SI-006', item_number: 'MAT-006'
        }]])
        .mockResolvedValueOnce([])                                // UPDATE defect_handling
        .mockResolvedValueOnce([[{ qualified_quantity: 80, unqualified_quantity: 20 }]]) // re-SELECT
        .mockResolvedValueOnce([]);                               // UPDATE stock_in_detail

      const req = mockReq({
        params: { inspection_number: 'QI-006' },
        body: {
          defect_handling: '退货',
          return_order_number: 'RET-001',
          handling_remark: '整批退货'
        }
      });
      const res = mockRes();
      await defectHandlingPurchaseInspection(req, res, vi.fn());

      expect(tx.commit).toHaveBeenCalled();
      // Verify return_order_number passed
      const updateCall = queryFn.mock.calls[1][1].replacements;
      expect(updateCall.return_order_number).toBe('RET-001');
      expect(updateCall.defect_handling).toBe('退货');
      // Verify writeback inspect_status
      const writebackRepl = queryFn.mock.calls[3][1].replacements;
      expect(writebackRepl.inspect_status).toBe('已处理-退货');
    });
  });
});
