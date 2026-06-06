/**
 * 采购对账 E2E 测试
 *
 * 双维度对账：
 *   Tab1 - 入库单明细对账（stock_in_detail.reconciliation_status）
 *   Tab2 - 采购订单明细对账（purchase_order_detail.reconciliation_status）
 *
 * 全链路：
 *   创建采购订单(2行) → 审批 → 创建入库单 → 确认入库
 *   → 对账分页查询(两个Tab) → 标记已对账/未对账 → 锁定行保护 → 打印对账单
 *
 * 策略：API 驱动 + DB 断言（纯API，无UI操作）
 */
import { test, expect } from '@playwright/test';
import {
  createPurchaseOrderAPI,
  getPurchaseOrderReceivableAPI,
  createStockInAPI,
  confirmStockInAPI,
  submitAndApprove,
  getApiContext,
  disposeApiContext,
} from '../helpers/api.helper';
import {
  findSupplier,
  findNonInspectionItem,
  getStockIn,
  getStockInDetail,
  getPurchaseOrder,
  cleanupPurchaseTestData,
  query,
  T,
} from '../helpers/db.helper';

const API_BASE = 'http://localhost:3000/api/v1';
const TEST_MARKER = `E2E-PUR-REC-${Date.now()}`;
const RAW_WH = '04';
const RAW_WH_NAME = '原材料仓库';

// 共享上下文
const ctx: {
  supplierNumber?: string;
  supplierName?: string;
  itemNumber?: string;
  itemName?: string;
  specifications?: string;
  basicUnit?: string;
  item2Number?: string;
  item2Name?: string;
  item2Spec?: string;
  item2Unit?: string;
  purchaseOrderNumber?: string;
  purchaseDetailIds: number[];
  stockInNumber?: string;
  stockInDetailIds: number[];
} = {
  purchaseDetailIds: [],
  stockInDetailIds: [],
};

function todayStr() { return new Date().toISOString().split('T')[0]; }

test.describe.serial('采购对账 E2E', () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    await getApiContext();
    await cleanupOldData();
  });

  test.afterAll(async () => {
    try {
      if (ctx.purchaseOrderNumber) {
        await cleanupPurchaseTestData(ctx.purchaseOrderNumber);
        console.log('[afterAll] 清理完成:', ctx.purchaseOrderNumber);
      }
    } catch (e) {
      console.warn('[afterAll] 清理异常:', e);
    }
    await disposeApiContext();
  });

  // ==================== T1: 前置数据准备 ====================
  test('T1. 前置：采购订单(2行)→审批→入库单→确认入库', async () => {
    // Step 1: 查找供应商和物料
    const supplier = await findSupplier();
    expect(supplier, '未找到供应商').toBeTruthy();
    ctx.supplierNumber = supplier!.supplier_number;
    ctx.supplierName = supplier!.supplier_name;

    // 找两个免检物料
    const item1 = await findNonInspectionItem();
    expect(item1, '未找到免检物料').toBeTruthy();
    ctx.itemNumber = item1!.item_number;
    ctx.itemName = item1!.item_name;
    ctx.specifications = item1!.specifications || '';
    ctx.basicUnit = item1!.basic_unit || '';

    // 找第二个免检物料
    const item2Rows = await query<any>(
      `SELECT TOP 1 item_number, item_name, specifications, basic_unit
       FROM item_master
       WHERE (incoming_inspection IS NULL OR incoming_inspection <> 'Y')
         AND item_type IN (N'原材料', N'骨架', N'预成型件')
         AND item_number <> @item1`,
      { item1: { type: T.NVarChar, value: ctx.itemNumber } }
    );
    if (item2Rows.length > 0) {
      ctx.item2Number = item2Rows[0].item_number;
      ctx.item2Name = item2Rows[0].item_name;
      ctx.item2Spec = item2Rows[0].specifications || '';
      ctx.item2Unit = item2Rows[0].basic_unit || '';
    }
    console.log(`[T1] 供应商: ${ctx.supplierNumber}, 物料1: ${ctx.itemNumber}, 物料2: ${ctx.item2Number || '无'}`);

    // Step 2: 创建采购订单
    const details = [{
      item_number: ctx.itemNumber!,
      item_name: ctx.itemName!,
      specifications: ctx.specifications,
      basic_unit: ctx.basicUnit,
      order_quantity: 100,
      unit_price: 1,
      delivery_date: todayStr(),
    }];
    if (ctx.item2Number) {
      details.push({
        item_number: ctx.item2Number,
        item_name: ctx.item2Name!,
        specifications: ctx.item2Spec || '',
        basic_unit: ctx.item2Unit || '',
        order_quantity: 80,
        unit_price: 1,
        delivery_date: todayStr(),
      });
    }

    const poResult = await createPurchaseOrderAPI({
      supplier_number: ctx.supplierNumber!,
      supplier_name: ctx.supplierName!,
      procurement_manager: 'E2E',
      order_date: todayStr(),
      delivery_date: todayStr(),
      remark: `${TEST_MARKER}`,
      details,
    });
    ctx.purchaseOrderNumber = poResult.purchase_order_number;
    expect(ctx.purchaseOrderNumber, '未返回采购订单号').toBeTruthy();
    console.log(`[T1] 采购订单: ${ctx.purchaseOrderNumber}`);

    // Step 3: 审批
    await submitAndApprove('purchase_order', ctx.purchaseOrderNumber);
    console.log(`[T1] 采购订单已审批`);

    // Step 4: 获取可收货明细
    const receivable = await getPurchaseOrderReceivableAPI(ctx.purchaseOrderNumber);
    const recItems = receivable?.items || [];
    expect(recItems.length, '可收货明细为空').toBeGreaterThan(0);
    console.log(`[T1] 可收货明细: ${recItems.length} 行`);

    // Step 5: 创建入库单
    const stockInDetails = recItems.map((item: any) => ({
      purchase_detail_id: item.id || item.purchase_detail_id,
      item_number: item.item_number,
      item_name: item.item_name,
      specifications: item.specifications || '',
      basic_unit: item.basic_unit || '',
      order_quantity: item.order_quantity,
      received_quantity: 0,
      stock_in_quantity: item.order_quantity,
      qualified_quantity: item.order_quantity,
      unqualified_quantity: 0,
    }));

    const siResult = await createStockInAPI({
      purchase_order_number: ctx.purchaseOrderNumber,
      warehouse_number: RAW_WH,
      warehouse_name: RAW_WH_NAME,
      remark: `${TEST_MARKER}-入库`,
      details: stockInDetails,
    });
    ctx.stockInNumber = siResult.stock_in_number;
    expect(ctx.stockInNumber, '未返回入库单号').toBeTruthy();
    console.log(`[T1] 入库单: ${ctx.stockInNumber}`);

    // Step 6: 确认入库
    await confirmStockInAPI(ctx.stockInNumber);
    const si = await getStockIn(ctx.stockInNumber);
    expect(si?.approval_status, '入库单未确认').toBe('已入库');
    console.log(`[T1] 入库单已入库: ${si?.approval_status}`);

    // 获取入库单明细IDs
    const siDetails = await getStockInDetail(ctx.stockInNumber);
    expect(siDetails.length, '入库单明细为空').toBeGreaterThan(0);
    const siDetailRows = await query<any>(
      `SELECT id FROM stock_in_detail WHERE stock_in_number = @si ORDER BY line_number`,
      { si: { type: T.NVarChar, value: ctx.stockInNumber } }
    );
    ctx.stockInDetailIds = siDetailRows.map((r: any) => r.id);
    console.log(`[T1] 入库明细IDs: ${ctx.stockInDetailIds.join(', ')}`);

    // 获取采购订单明细IDs
    const poDetailRows = await query<any>(
      `SELECT id FROM purchase_order_detail WHERE purchase_order_number = @po ORDER BY line_number`,
      { po: { type: T.NVarChar, value: ctx.purchaseOrderNumber } }
    );
    ctx.purchaseDetailIds = poDetailRows.map((r: any) => r.id);
    console.log(`[T1] 采购明细IDs: ${ctx.purchaseDetailIds.join(', ')}`);

    // DB 断言: 默认对账状态为 '未对账'
    for (const id of ctx.stockInDetailIds) {
      const rows = await query<any>(
        `SELECT reconciliation_status FROM stock_in_detail WHERE id = @id`,
        { id: { type: T.Int, value: id } }
      );
      expect(rows[0].reconciliation_status).toBe('未对账');
    }
    console.log(`[T1] 入库明细对账状态默认: 未对账`);

    for (const id of ctx.purchaseDetailIds) {
      const rows = await query<any>(
        `SELECT reconciliation_status FROM purchase_order_detail WHERE id = @id`,
        { id: { type: T.Int, value: id } }
      );
      expect(rows[0].reconciliation_status).toBe('未对账');
    }
    console.log(`[T1] 采购明细对账状态默认: 未对账`);
  });

  // ==================== T2: 入库单明细-分页查询 ====================
  test('T2. 入库单明细-分页查询', async () => {
    const api = await getApiContext();
    const res = await api.get(`${API_BASE}/stock-ins/reconciliation/page`, {
      params: { page: 1, limit: 50 },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBeGreaterThanOrEqual(1);

    const ourItems = (body.data.items || []).filter(
      (i: any) => i.stock_in_number === ctx.stockInNumber
    );
    expect(ourItems.length, '应包含测试入库单明细').toBeGreaterThanOrEqual(1);

    const first = ourItems[0];
    expect(first.detail_id).toBeDefined();
    expect(first.stock_in_number).toBeDefined();
    expect(first.reconciliation_status).toBeDefined();
    expect(first.qualified_quantity).toBeDefined();
    console.log(`[T2] 入库对账分页: total=${body.data.total}, 本测试行=${ourItems.length}`);
  });

  // ==================== T3: 采购订单明细-分页查询 ====================
  test('T3. 采购订单明细-分页查询', async () => {
    const api = await getApiContext();
    const res = await api.get(`${API_BASE}/purchase-orders/reconciliation/page`, {
      params: { page: 1, limit: 50 },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);

    const ourItems = (body.data.items || []).filter(
      (i: any) => i.purchase_order_number === ctx.purchaseOrderNumber
    );
    expect(ourItems.length, '应包含测试采购订单明细').toBeGreaterThanOrEqual(1);

    const first = ourItems[0];
    expect(first.detail_id).toBeDefined();
    expect(first.purchase_order_number).toBeDefined();
    expect(first.order_quantity).toBeDefined();
    expect(first.received_quantity).toBeDefined();
    console.log(`[T3] 采购对账分页: total=${body.data.total}, 本测试行=${ourItems.length}`);
  });

  // ==================== T4: 入库单-按对账状态过滤 ====================
  test('T4. 入库单-按对账状态过滤', async () => {
    const api = await getApiContext();

    // 未对账
    const res1 = await api.get(`${API_BASE}/stock-ins/reconciliation/page`, {
      params: { page: 1, limit: 100, reconciliationStatus: '未对账' },
    });
    const body1 = await res1.json();
    const our1 = (body1.data.items || []).filter((i: any) => i.stock_in_number === ctx.stockInNumber);
    expect(our1.length).toBeGreaterThanOrEqual(1);
    console.log(`[T4] 未对账过滤: ${our1.length} 条`);

    // 已对账（此时应为0）
    const res2 = await api.get(`${API_BASE}/stock-ins/reconciliation/page`, {
      params: { page: 1, limit: 100, reconciliationStatus: '已对账' },
    });
    const body2 = await res2.json();
    const our2 = (body2.data.items || []).filter((i: any) => i.stock_in_number === ctx.stockInNumber);
    expect(our2.length).toBe(0);
    console.log(`[T4] 已对账过滤: ${our2.length} 条（预期0）`);
  });

  // ==================== T5: 入库单-关键字搜索 ====================
  test('T5. 入库单-关键字搜索', async () => {
    const api = await getApiContext();

    // 按入库单号搜索
    const res1 = await api.get(`${API_BASE}/stock-ins/reconciliation/page`, {
      params: { page: 1, limit: 50, search: ctx.stockInNumber },
    });
    const body1 = await res1.json();
    expect(body1.data.items.length, '按入库单号搜索应有结果').toBeGreaterThanOrEqual(1);
    console.log(`[T5] 按入库单号搜索: ${body1.data.items.length} 条`);

    // 按采购订单号搜索
    const res2 = await api.get(`${API_BASE}/stock-ins/reconciliation/page`, {
      params: { page: 1, limit: 50, search: ctx.purchaseOrderNumber },
    });
    const body2 = await res2.json();
    expect(body2.data.items.length, '按采购订单号搜索应有结果').toBeGreaterThanOrEqual(1);
    console.log(`[T5] 按采购订单号搜索: ${body2.data.items.length} 条`);

    // 搜索不存在的值
    const res3 = await api.get(`${API_BASE}/stock-ins/reconciliation/page`, {
      params: { page: 1, limit: 50, search: 'NOT-EXIST-999' },
    });
    const body3 = await res3.json();
    expect(body3.data.total).toBe(0);
    console.log(`[T5] 不存在关键字: ${body3.data.total} 条（预期0）`);
  });

  // ==================== T6: 入库单-标记已对账 ====================
  test('T6. 入库单明细-标记已对账', async () => {
    const api = await getApiContext();
    const firstId = ctx.stockInDetailIds[0];

    const res = await api.put(`${API_BASE}/stock-ins/reconciliation/status`, {
      data: { detailIds: [firstId], reconciliationStatus: '已对账' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log(`[T6] 入库明细标记已对账: id=${firstId}`);

    // DB 断言
    const rows = await query<any>(
      `SELECT reconciliation_status FROM stock_in_detail WHERE id = @id`,
      { id: { type: T.Int, value: firstId } }
    );
    expect(rows[0].reconciliation_status).toBe('已对账');
  });

  // ==================== T7: 入库单-标记回未对账 ====================
  test('T7. 入库单明细-标记回未对账', async () => {
    const api = await getApiContext();
    const firstId = ctx.stockInDetailIds[0];

    const res = await api.put(`${API_BASE}/stock-ins/reconciliation/status`, {
      data: { detailIds: [firstId], reconciliationStatus: '未对账' },
    });
    expect(res.ok()).toBeTruthy();

    const rows = await query<any>(
      `SELECT reconciliation_status FROM stock_in_detail WHERE id = @id`,
      { id: { type: T.Int, value: firstId } }
    );
    expect(rows[0].reconciliation_status).toBe('未对账');
    console.log(`[T7] 入库明细恢复未对账`);
  });

  // ==================== T8: 入库单-批量标记已对账 ====================
  test('T8. 入库单明细-批量标记已对账', async () => {
    const api = await getApiContext();

    const res = await api.put(`${API_BASE}/stock-ins/reconciliation/status`, {
      data: { detailIds: ctx.stockInDetailIds, reconciliationStatus: '已对账' },
    });
    expect(res.ok()).toBeTruthy();
    console.log(`[T8] 批量标记已对账: IDs=${ctx.stockInDetailIds.join(',')}`);

    // DB 断言：全部已对账
    const rows = await query<any>(
      `SELECT id, reconciliation_status FROM stock_in_detail WHERE stock_in_number = @si`,
      { si: { type: T.NVarChar, value: ctx.stockInNumber } }
    );
    for (const row of rows) {
      expect(row.reconciliation_status).toBe('已对账');
    }

    // 恢复未对账（后续测试需要）
    await api.put(`${API_BASE}/stock-ins/reconciliation/status`, {
      data: { detailIds: ctx.stockInDetailIds, reconciliationStatus: '未对账' },
    });
  });

  // ==================== T9: 入库单-锁定行保护 ====================
  test('T9. 入库单明细-锁定行保护（已审批+已对账+已开票）', async () => {
    const api = await getApiContext();
    const firstId = ctx.stockInDetailIds[0];

    // 设置锁定条件（入库单需 approval_status='已审批'）
    await query(
      `UPDATE stock_in SET approval_status = N'已审批' WHERE stock_in_number = @si`,
      { si: { type: T.NVarChar, value: ctx.stockInNumber } }
    );
    await query(
      `UPDATE stock_in_detail SET reconciliation_status = N'已对账', invoice_status = N'已开票' WHERE id = @id`,
      { id: { type: T.Int, value: firstId } }
    );
    console.log(`[T9] 设置锁定条件: id=${firstId}`);

    // 尝试修改 → 应被拒绝
    const res = await api.put(`${API_BASE}/stock-ins/reconciliation/status`, {
      data: { detailIds: [firstId], reconciliationStatus: '未对账' },
    });
    expect(res.ok()).toBeFalsy();
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('不能修改');
    console.log(`[T9] 锁定行拒绝: ${body.message}`);

    // 非锁定行可以操作
    if (ctx.stockInDetailIds.length > 1) {
      const secondId = ctx.stockInDetailIds[1];
      const res2 = await api.put(`${API_BASE}/stock-ins/reconciliation/status`, {
        data: { detailIds: [secondId], reconciliationStatus: '已对账' },
      });
      expect(res2.ok()).toBeTruthy();
      console.log(`[T9] 非锁定行操作成功`);
      // 恢复
      await api.put(`${API_BASE}/stock-ins/reconciliation/status`, {
        data: { detailIds: [secondId], reconciliationStatus: '未对账' },
      });
    }

    // 恢复锁定行 + 入库单状态
    await query(
      `UPDATE stock_in_detail SET reconciliation_status = N'未对账', invoice_status = N'未开票' WHERE id = @id`,
      { id: { type: T.Int, value: firstId } }
    );
    await query(
      `UPDATE stock_in SET approval_status = N'已入库' WHERE stock_in_number = @si`,
      { si: { type: T.NVarChar, value: ctx.stockInNumber } }
    );
  });

  // ==================== T10: 入库单-打印数据 ====================
  test('T10. 入库单明细-获取打印数据', async () => {
    const api = await getApiContext();

    const res = await api.post(`${API_BASE}/stock-ins/reconciliation/print`, {
      data: { detailIds: ctx.stockInDetailIds },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);

    const first = body.data.items[0];
    expect(first.stock_in_number).toBeTruthy();
    expect(first.item_number).toBeTruthy();
    expect(first.qualified_quantity).toBeDefined();
    console.log(`[T10] 入库打印数据: ${body.data.items.length} 条`);
  });

  // ==================== T11: 采购订单明细-标记已对账 ====================
  test('T11. 采购订单明细-标记已对账', async () => {
    const api = await getApiContext();
    const firstId = ctx.purchaseDetailIds[0];

    const res = await api.put(`${API_BASE}/purchase-orders/reconciliation/status`, {
      data: { detailIds: [firstId], reconciliationStatus: '已对账' },
    });
    expect(res.ok()).toBeTruthy();
    console.log(`[T11] 采购明细标记已对账: id=${firstId}`);

    const rows = await query<any>(
      `SELECT reconciliation_status FROM purchase_order_detail WHERE id = @id`,
      { id: { type: T.Int, value: firstId } }
    );
    expect(rows[0].reconciliation_status).toBe('已对账');

    // 恢复
    await api.put(`${API_BASE}/purchase-orders/reconciliation/status`, {
      data: { detailIds: [firstId], reconciliationStatus: '未对账' },
    });
  });

  // ==================== T12: 采购订单明细-批量标记 ====================
  test('T12. 采购订单明细-批量标记已对账+恢复', async () => {
    const api = await getApiContext();

    // 批量标记
    const res = await api.put(`${API_BASE}/purchase-orders/reconciliation/status`, {
      data: { detailIds: ctx.purchaseDetailIds, reconciliationStatus: '已对账' },
    });
    expect(res.ok()).toBeTruthy();
    console.log(`[T12] 批量标记已对账`);

    const rows = await query<any>(
      `SELECT reconciliation_status FROM purchase_order_detail WHERE purchase_order_number = @po`,
      { po: { type: T.NVarChar, value: ctx.purchaseOrderNumber } }
    );
    for (const row of rows) {
      expect(row.reconciliation_status).toBe('已对账');
    }

    // 批量恢复
    const res2 = await api.put(`${API_BASE}/purchase-orders/reconciliation/status`, {
      data: { detailIds: ctx.purchaseDetailIds, reconciliationStatus: '未对账' },
    });
    expect(res2.ok()).toBeTruthy();
    console.log(`[T12] 批量恢复未对账`);
  });

  // ==================== T13: 采购订单明细-锁定行保护 ====================
  test('T13. 采购订单明细-锁定行保护（已审批+已对账+已开票）', async () => {
    const api = await getApiContext();
    const firstId = ctx.purchaseDetailIds[0];

    // 设置锁定条件
    await query(
      `UPDATE purchase_order_detail SET reconciliation_status = N'已对账', invoice_status = N'已开票' WHERE id = @id`,
      { id: { type: T.Int, value: firstId } }
    );
    // purchase_order.approval_status 已经是 '已审批'
    console.log(`[T13] 设置锁定条件: id=${firstId}`);

    const res = await api.put(`${API_BASE}/purchase-orders/reconciliation/status`, {
      data: { detailIds: [firstId], reconciliationStatus: '未对账' },
    });
    expect(res.ok()).toBeFalsy();
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('不能修改');
    console.log(`[T13] 锁定行拒绝: ${body.message}`);

    // 恢复
    await query(
      `UPDATE purchase_order_detail SET reconciliation_status = N'未对账', invoice_status = N'未开票' WHERE id = @id`,
      { id: { type: T.Int, value: firstId } }
    );
  });

  // ==================== T14: 采购订单明细-打印数据 ====================
  test('T14. 采购订单明细-获取打印数据', async () => {
    const api = await getApiContext();

    const res = await api.post(`${API_BASE}/purchase-orders/reconciliation/print`, {
      data: { detailIds: ctx.purchaseDetailIds },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);

    const first = body.data.items[0];
    expect(first.purchase_order_number).toBeTruthy();
    expect(first.item_number).toBeTruthy();
    expect(first.order_quantity).toBeDefined();
    expect(first.received_quantity).toBeDefined();
    console.log(`[T14] 采购打印数据: ${body.data.items.length} 条`);
  });

  // ==================== T15: 错误校验 ====================
  test('T15. 错误校验（空IDs/无效状态）', async () => {
    const api = await getApiContext();

    // 入库单：空IDs → 400
    const r1 = await api.put(`${API_BASE}/stock-ins/reconciliation/status`, {
      data: { detailIds: [], reconciliationStatus: '已对账' },
    });
    expect(r1.status()).toBe(400);

    // 入库单：无效状态 → 400
    const r2 = await api.put(`${API_BASE}/stock-ins/reconciliation/status`, {
      data: { detailIds: ctx.stockInDetailIds, reconciliationStatus: '无效' },
    });
    expect(r2.status()).toBe(400);

    // 入库单：空打印 → 400
    const r3 = await api.post(`${API_BASE}/stock-ins/reconciliation/print`, {
      data: { detailIds: [] },
    });
    expect(r3.status()).toBe(400);

    // 采购订单：空IDs → 400
    const r4 = await api.put(`${API_BASE}/purchase-orders/reconciliation/status`, {
      data: { detailIds: [], reconciliationStatus: '已对账' },
    });
    expect(r4.status()).toBe(400);

    // 采购订单：无效状态 → 400
    const r5 = await api.put(`${API_BASE}/purchase-orders/reconciliation/status`, {
      data: { detailIds: ctx.purchaseDetailIds, reconciliationStatus: '无效' },
    });
    expect(r5.status()).toBe(400);

    // 采购订单：空打印 → 400
    const r6 = await api.post(`${API_BASE}/purchase-orders/reconciliation/print`, {
      data: { detailIds: [] },
    });
    expect(r6.status()).toBe(400);

    console.log(`[T15] 全部错误校验通过`);
  });

  // ==================== T16: 采购订单明细-搜索 ====================
  test('T16. 采购订单明细-关键字搜索', async () => {
    const api = await getApiContext();

    // 按采购订单号搜索
    const res = await api.get(`${API_BASE}/purchase-orders/reconciliation/page`, {
      params: { page: 1, limit: 50, search: ctx.purchaseOrderNumber },
    });
    const body = await res.json();
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);
    console.log(`[T16] 按采购订单号搜索: ${body.data.items.length} 条`);

    // 按物料编号搜索
    const res2 = await api.get(`${API_BASE}/purchase-orders/reconciliation/page`, {
      params: { page: 1, limit: 50, search: ctx.itemNumber },
    });
    const body2 = await res2.json();
    expect(body2.data.items.length).toBeGreaterThanOrEqual(1);
    console.log(`[T16] 按物料编号搜索: ${body2.data.items.length} 条`);
  });

  // ==================== T17: 分页校验 ====================
  test('T17. 分页校验', async () => {
    const api = await getApiContext();

    // limit=1
    const res = await api.get(`${API_BASE}/stock-ins/reconciliation/page`, {
      params: { page: 1, limit: 1 },
    });
    const body = await res.json();
    expect(body.data.items.length).toBe(1);
    expect(body.data.total).toBeGreaterThanOrEqual(1);
    console.log(`[T17] limit=1: items=${body.data.items.length}, total=${body.data.total}`);

    // page=9999
    const res2 = await api.get(`${API_BASE}/stock-ins/reconciliation/page`, {
      params: { page: 9999, limit: 10 },
    });
    const body2 = await res2.json();
    expect(body2.data.items.length).toBe(0);
    console.log(`[T17] page=9999: items=0`);
  });

  // ==================== T18: 组合过滤 ====================
  test('T18. 组合过滤（搜索+状态）', async () => {
    const api = await getApiContext();
    const firstId = ctx.stockInDetailIds[0];

    // 先标记第一行已对账
    await api.put(`${API_BASE}/stock-ins/reconciliation/status`, {
      data: { detailIds: [firstId], reconciliationStatus: '已对账' },
    });

    // 搜索入库单号 + 过滤已对账
    const res = await api.get(`${API_BASE}/stock-ins/reconciliation/page`, {
      params: {
        page: 1, limit: 50,
        search: ctx.stockInNumber,
        reconciliationStatus: '已对账',
      },
    });
    const body = await res.json();
    const items = body.data.items || [];
    expect(items.length, '组合过滤应匹配1条').toBe(1);
    expect(items[0].reconciliation_status).toBe('已对账');
    console.log(`[T18] 组合过滤: ${items.length} 条`);

    // 恢复
    await api.put(`${API_BASE}/stock-ins/reconciliation/status`, {
      data: { detailIds: [firstId], reconciliationStatus: '未对账' },
    });
  });

  // ==================== T19: 最终状态验证 ====================
  test('T19. 最终状态验证', async () => {
    // 入库明细对账状态
    const siRows = await query<any>(
      `SELECT id, reconciliation_status, invoice_status FROM stock_in_detail WHERE stock_in_number = @si ORDER BY id`,
      { si: { type: T.NVarChar, value: ctx.stockInNumber } }
    );
    console.log(`[T19] 入库明细最终状态:`);
    for (const r of siRows) {
      console.log(`  id=${r.id}: rec=${r.reconciliation_status}, inv=${r.invoice_status}`);
      expect(r.reconciliation_status).toBe('未对账');
    }

    // 采购明细对账状态
    const poRows = await query<any>(
      `SELECT id, reconciliation_status, invoice_status FROM purchase_order_detail WHERE purchase_order_number = @po ORDER BY id`,
      { po: { type: T.NVarChar, value: ctx.purchaseOrderNumber } }
    );
    console.log(`[T19] 采购明细最终状态:`);
    for (const r of poRows) {
      console.log(`  id=${r.id}: rec=${r.reconciliation_status}, inv=${r.invoice_status}`);
      expect(r.reconciliation_status).toBe('未对账');
    }

    // 入库单状态
    const si = await getStockIn(ctx.stockInNumber!);
    expect(si?.approval_status).toBe('已入库');
    console.log(`[T19] 入库单状态: ${si?.approval_status}`);

    // 采购订单状态
    const po = await getPurchaseOrder(ctx.purchaseOrderNumber!);
    expect(po.header?.approval_status).toBe('已审批');
    console.log(`[T19] 采购订单状态: ${po.header?.approval_status}`);

    console.log(`[T19] 全部通过 ✓`);
  });
});

// ==================== 清理旧数据 ====================
async function cleanupOldData() {
  try {
    const orders = await query<any>(
      `SELECT purchase_order_number FROM purchase_order WHERE remark LIKE @mk`,
      { mk: { type: T.NVarChar, value: `E2E-PUR-REC-%` } }
    );
    for (const o of orders) {
      await cleanupPurchaseTestData(o.purchase_order_number);
    }
    if (orders.length > 0) {
      console.log(`[cleanupOldData] 清理旧订单数: ${orders.length}`);
    }
  } catch (e) {
    console.warn('[cleanupOldData] 清理异常:', e);
  }
}
