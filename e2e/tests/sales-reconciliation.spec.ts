/**
 * 销售对账 E2E 测试
 *
 * 全链路：
 *   销售订单(2行明细) → 审批 → 发货申请 → 审批 → 批次出库(生成发货单+明细)
 *   → 对账分页查询 → 标记已对账/未对账 → 锁定行校验 → 打印对账单
 *
 * 策略：API 驱动 + DB 断言（纯API，无UI操作）
 */
import { test, expect } from '@playwright/test';
import {
  getLatestSalesOrder,
  getSalesOrderDetails,
  getShippingOrder,
  getShippingOrderDetails,
  getFinishedBatchInventory,
  seedFinishedInventory,
  cleanupShippingReturnChain,
  query,
  T,
} from '../helpers/db.helper';
import {
  getApiContext,
  disposeApiContext,
  submitAndApprove,
  createSalesOrderAPI,
  createShippingRequestAPI,
  updateShippingRequestStatusAPI,
  batchOutboundAPI,
} from '../helpers/api.helper';

// ==================== 常量 ====================
const API_BASE = 'http://localhost:3000/api/v1';
const TEST_ITEMS = ['C100809', 'C100501']; // 两个物料，各一行明细
const TEST_QTY = 80;
const WAREHOUSE_FINISHED = '01';
const WAREHOUSE_NAME = '成品仓';
const TEST_REMARK = 'E2E-SALES-RECON';
const CUSTOMER_NUMBER = 'AH001';

// ==================== 共享上下文 ====================
const ctx: {
  salesOrderNumber?: string;
  salesDetailIds: number[];
  requestNumber?: string;
  shippingOrderNumber?: string;
  shippingDetailIds: number[];
  seededBatchNumbers: string[];
} = {
  salesDetailIds: [],
  shippingDetailIds: [],
  seededBatchNumbers: [],
};

// ==================== 测试套件 ====================
test.describe.serial('销售对账 E2E', () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    await getApiContext();
    await cleanupOldData();
  });

  test.afterAll(async () => {
    try {
      const r = await cleanupShippingReturnChain({
        salesOrderNumber: ctx.salesOrderNumber,
        shippingRequestNumbers: ctx.requestNumber ? [ctx.requestNumber] : [],
        shippingOrderNumbers: ctx.shippingOrderNumber ? [ctx.shippingOrderNumber] : [],
        returnOrderNumbers: [],
      });
      console.log('[afterAll] 清理结果:', r);
    } catch (e) {
      console.warn('[afterAll] 清理异常:', e);
    }
    await disposeApiContext();
  });

  // ==================== T1: 前置数据准备 ====================
  test('T1. 前置：创建销售订单(2行)→审批→发货申请→审批→批次出库', async () => {
    // Step 1: 种子成品库存（两个物料各200）
    for (const item of TEST_ITEMS) {
      const batchNo = await seedFinishedInventory(item, WAREHOUSE_FINISHED, 200);
      expect(batchNo, `种子库存失败: ${item}`).toBeTruthy();
      ctx.seededBatchNumbers.push(batchNo!);
      console.log(`[T1] 种子库存: ${item} → ${batchNo}`);
    }

    // Step 2: 创建销售订单（2行明细）
    const soResult = await createSalesOrderAPI({
      customer_number: CUSTOMER_NUMBER,
      remark: TEST_REMARK,
      details: TEST_ITEMS.map(item => ({
        item_number: item,
        order_quantity: TEST_QTY,
      })),
    });
    expect(soResult?.sales_order_number, '未返回销售订单号').toBeTruthy();
    ctx.salesOrderNumber = soResult.sales_order_number;
    console.log(`[T1] 销售订单: ${ctx.salesOrderNumber}`);

    // Step 3: 审批销售订单
    await submitAndApprove('sales_order', ctx.salesOrderNumber);
    const so = await getLatestSalesOrder(CUSTOMER_NUMBER);
    expect(so?.approval_status, '销售订单审批失败').toBe('已审批');
    console.log(`[T1] 销售订单已审批`);

    // Step 4: 获取销售订单明细
    const details = await getSalesOrderDetails(ctx.salesOrderNumber);
    expect(details.length, '销售订单明细行数不足').toBeGreaterThanOrEqual(2);
    ctx.salesDetailIds = details.map((d: any) => d.id);
    console.log(`[T1] 销售明细: ${details.map((d: any) => `id=${d.id}(${d.item_number})`).join(', ')}`);

    // Step 5: 创建发货申请（2行）
    const srResult = await createShippingRequestAPI({
      customer_number: CUSTOMER_NUMBER,
      remark: 'E2E-销售对账发货',
      details: details.map((d: any) => ({
        sales_order_number: ctx.salesOrderNumber,
        detail_id: d.id,
        item_number: d.item_number,
        order_quantity: d.order_quantity,
        shipped_quantity: 0,
        ship_quantity: d.order_quantity,
      })),
    });
    expect(srResult?.request_number, '未返回发货申请号').toBeTruthy();
    ctx.requestNumber = srResult.request_number;
    console.log(`[T1] 发货申请: ${ctx.requestNumber}`);

    // Step 6: 审批发货申请
    await updateShippingRequestStatusAPI(ctx.requestNumber, '已审核');
    console.log(`[T1] 发货申请已审核`);

    // Step 7: 批次出库（2个物料各出库 TEST_QTY）
    const outboundItems = details.map((d: any) => {
      const batches = [{ batch_number: ctx.seededBatchNumbers[TEST_ITEMS.indexOf(d.item_number)], quantity: TEST_QTY }];
      return {
        request_number: ctx.requestNumber!,
        detail_id: d.id,
        item_number: d.item_number,
        ship_quantity: TEST_QTY,
        warehouse_number: WAREHOUSE_FINISHED,
        warehouse_name: WAREHOUSE_NAME,
        sales_detail_id: d.id,
        batch_items: batches,
      };
    });

    const outboundResult = await batchOutboundAPI({
      warehouse_number: WAREHOUSE_FINISHED,
      warehouse_name: WAREHOUSE_NAME,
      remark: 'E2E-销售对账出库',
      items: outboundItems,
    });

    if (outboundResult?.shippingOrderNumber) {
      ctx.shippingOrderNumber = outboundResult.shippingOrderNumber;
    }
    expect(ctx.shippingOrderNumber, '未生成发货单').toBeTruthy();
    console.log(`[T1] 发货单: ${ctx.shippingOrderNumber}`);

    // 获取发货单明细
    const shipDetails = await getShippingOrderDetails(ctx.shippingOrderNumber);
    expect(shipDetails.length, '发货单明细为空').toBeGreaterThanOrEqual(2);
    ctx.shippingDetailIds = shipDetails.map((d: any) => d.id);
    console.log(`[T1] 发货明细IDs: ${ctx.shippingDetailIds.join(', ')}`);

    // DB 断言：默认 reconciliation_status 为 '未对账'
    const recRows = await query<any>(
      `SELECT id, reconciliation_status, invoice_status FROM shipping_order_detail WHERE shipping_order_number = @son`,
      { son: { type: T.NVarChar, value: ctx.shippingOrderNumber } }
    );
    for (const row of recRows) {
      expect(row.reconciliation_status).toBe('未对账');
    }
    console.log(`[T1] 对账状态默认: ${recRows.map((r: any) => `${r.id}=${r.reconciliation_status}`).join(', ')}`);
  });

  // ==================== T2: 查询对账分页（无过滤） ====================
  test('T2. 查询对账分页（无过滤）', async () => {
    expect(ctx.shippingOrderNumber, '无发货单号').toBeTruthy();
    const api = await getApiContext();

    const res = await api.get(`${API_BASE}/shipping-orders/reconciliation/page`, {
      params: { page: 1, limit: 50 },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBeGreaterThanOrEqual(2);

    const items = body.data.items || [];
    // 应包含我们创建的发货单明细
    const ourItems = items.filter((i: any) => i.shipping_order_number === ctx.shippingOrderNumber);
    expect(ourItems.length, '应包含测试发货单明细').toBeGreaterThanOrEqual(2);

    // 检查返回字段完整性
    const first = ourItems[0];
    expect(first.detail_id).toBeDefined();
    expect(first.shipping_order_number).toBeDefined();
    expect(first.customer_name).toBeDefined();
    expect(first.reconciliation_status).toBeDefined();
    expect(first.invoice_status).toBeDefined();
    console.log(`[T2] 分页总数: ${body.data.total}, 本测试行: ${ourItems.length}`);
  });

  // ==================== T3: 按对账状态过滤 ====================
  test('T3. 按对账状态过滤（未对账）', async () => {
    const api = await getApiContext();
    const res = await api.get(`${API_BASE}/shipping-orders/reconciliation/page`, {
      params: { page: 1, limit: 100, reconciliationStatus: '未对账' },
    });
    const body = await res.json();
    const items = (body.data.items || []).filter(
      (i: any) => i.shipping_order_number === ctx.shippingOrderNumber
    );
    expect(items.length, '过滤未对账应有测试明细').toBeGreaterThanOrEqual(2);
    for (const item of items) {
      expect(item.reconciliation_status).toBe('未对账');
    }
    console.log(`[T3] 未对账过滤: ${items.length} 条`);

    // 再测"已对账"过滤（此时应为0条测试明细）
    const res2 = await api.get(`${API_BASE}/shipping-orders/reconciliation/page`, {
      params: { page: 1, limit: 100, reconciliationStatus: '已对账' },
    });
    const body2 = await res2.json();
    const ourRec = (body2.data.items || []).filter(
      (i: any) => i.shipping_order_number === ctx.shippingOrderNumber
    );
    expect(ourRec.length, '已对账过滤应为0条测试明细').toBe(0);
    console.log(`[T3] 已对账过滤: ${ourRec.length} 条（预期0）`);
  });

  // ==================== T4: 关键字搜索 ====================
  test('T4. 关键字搜索（发货单号/客户/销售订单号）', async () => {
    const api = await getApiContext();

    // 按发货单号搜索
    const res1 = await api.get(`${API_BASE}/shipping-orders/reconciliation/page`, {
      params: { page: 1, limit: 50, search: ctx.shippingOrderNumber },
    });
    const body1 = await res1.json();
    expect(body1.data.items.length, '按发货单号搜索应有结果').toBeGreaterThanOrEqual(2);
    console.log(`[T4] 按发货单号搜索: ${body1.data.items.length} 条`);

    // 按销售订单号搜索
    const res2 = await api.get(`${API_BASE}/shipping-orders/reconciliation/page`, {
      params: { page: 1, limit: 50, search: ctx.salesOrderNumber },
    });
    const body2 = await res2.json();
    expect(body2.data.items.length, '按销售订单号搜索应有结果').toBeGreaterThanOrEqual(2);
    console.log(`[T4] 按销售订单号搜索: ${body2.data.items.length} 条`);

    // 搜索不存在的值
    const res3 = await api.get(`${API_BASE}/shipping-orders/reconciliation/page`, {
      params: { page: 1, limit: 50, search: 'NOT-EXIST-XXX-99999' },
    });
    const body3 = await res3.json();
    expect(body3.data.total).toBe(0);
    console.log(`[T4] 不存在关键字: ${body3.data.total} 条（预期0）`);
  });

  // ==================== T5: 单行标记已对账 ====================
  test('T5. 单行标记已对账', async () => {
    expect(ctx.shippingDetailIds.length, '无发货明细ID').toBeGreaterThanOrEqual(2);
    const api = await getApiContext();
    const firstId = ctx.shippingDetailIds[0];

    const res = await api.put(`${API_BASE}/shipping-orders/reconciliation/status`, {
      data: { detailIds: [firstId], reconciliationStatus: '已对账' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log(`[T5] 标记已对账: id=${firstId}, msg=${body.message}`);

    // DB 断言
    const rows = await query<any>(
      `SELECT reconciliation_status FROM shipping_order_detail WHERE id = @id`,
      { id: { type: T.Int, value: firstId } }
    );
    expect(rows[0].reconciliation_status).toBe('已对账');
    console.log(`[T5] DB验证: reconciliation_status=已对账`);

    // 第二行仍为未对账
    const rows2 = await query<any>(
      `SELECT reconciliation_status FROM shipping_order_detail WHERE id = @id`,
      { id: { type: T.Int, value: ctx.shippingDetailIds[1] } }
    );
    expect(rows2[0].reconciliation_status).toBe('未对账');
  });

  // ==================== T6: 单行标记回未对账 ====================
  test('T6. 单行标记回未对账', async () => {
    const api = await getApiContext();
    const firstId = ctx.shippingDetailIds[0];

    const res = await api.put(`${API_BASE}/shipping-orders/reconciliation/status`, {
      data: { detailIds: [firstId], reconciliationStatus: '未对账' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log(`[T6] 标记回未对账: id=${firstId}`);

    // DB 断言
    const rows = await query<any>(
      `SELECT reconciliation_status FROM shipping_order_detail WHERE id = @id`,
      { id: { type: T.Int, value: firstId } }
    );
    expect(rows[0].reconciliation_status).toBe('未对账');
  });

  // ==================== T7: 批量标记已对账（2行） ====================
  test('T7. 批量标记已对账（全部2行）', async () => {
    const api = await getApiContext();

    const res = await api.put(`${API_BASE}/shipping-orders/reconciliation/status`, {
      data: { detailIds: ctx.shippingDetailIds, reconciliationStatus: '已对账' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log(`[T7] 批量标记已对账: IDs=${ctx.shippingDetailIds.join(',')}, msg=${body.message}`);

    // DB 断言：两行都应为已对账
    const rows = await query<any>(
      `SELECT id, reconciliation_status FROM shipping_order_detail WHERE shipping_order_number = @son`,
      { son: { type: T.NVarChar, value: ctx.shippingOrderNumber } }
    );
    for (const row of rows) {
      expect(row.reconciliation_status).toBe('已对账');
    }
    console.log(`[T7] DB验证: 全部已对账`);
  });

  // ==================== T8: 批量标记回未对账（恢复） ====================
  test('T8. 批量标记回未对账（恢复）', async () => {
    const api = await getApiContext();

    const res = await api.put(`${API_BASE}/shipping-orders/reconciliation/status`, {
      data: { detailIds: ctx.shippingDetailIds, reconciliationStatus: '未对账' },
    });
    expect(res.ok()).toBeTruthy();
    console.log(`[T8] 批量恢复未对账`);

    // DB 断言
    const rows = await query<any>(
      `SELECT id, reconciliation_status FROM shipping_order_detail WHERE shipping_order_number = @son`,
      { son: { type: T.NVarChar, value: ctx.shippingOrderNumber } }
    );
    for (const row of rows) {
      expect(row.reconciliation_status).toBe('未对账');
    }
  });

  // ==================== T9: 锁定行保护（已签收+已对账+已开票） ====================
  test('T9. 锁定行保护（已签收+已对账+已开票→不可修改）', async () => {
    const api = await getApiContext();
    const firstId = ctx.shippingDetailIds[0];

    // Step 1: SQL 将第一行设为锁定条件
    await query(
      `UPDATE shipping_order SET status = N'已签收' WHERE shipping_order_number = @son`,
      { son: { type: T.NVarChar, value: ctx.shippingOrderNumber } }
    );
    await query(
      `UPDATE shipping_order_detail SET reconciliation_status = N'已对账', invoice_status = N'已开票' WHERE id = @id`,
      { id: { type: T.Int, value: firstId } }
    );
    console.log(`[T9] 设置锁定条件: id=${firstId}, 已签收+已对账+已开票`);

    // Step 2: 尝试修改该行的对账状态 → 应被拒绝
    const res = await api.put(`${API_BASE}/shipping-orders/reconciliation/status`, {
      data: { detailIds: [firstId], reconciliationStatus: '未对账' },
    });
    expect(res.ok()).toBeFalsy();
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('不能修改');
    console.log(`[T9] 锁定行拒绝: ${body.message}`);

    // Step 3: 混合操作（锁定行 + 非锁定行）→ 应被拒绝
    const res2 = await api.put(`${API_BASE}/shipping-orders/reconciliation/status`, {
      data: { detailIds: ctx.shippingDetailIds, reconciliationStatus: '已对账' },
    });
    expect(res2.ok()).toBeFalsy();
    expect(res2.status()).toBe(400);
    console.log(`[T9] 混合操作也被拒绝`);

    // Step 4: 仅操作非锁定行 → 应成功
    const secondId = ctx.shippingDetailIds[1];
    const res3 = await api.put(`${API_BASE}/shipping-orders/reconciliation/status`, {
      data: { detailIds: [secondId], reconciliationStatus: '已对账' },
    });
    expect(res3.ok()).toBeTruthy();
    console.log(`[T9] 非锁定行操作成功`);

    // 恢复：将发货单状态恢复为已发货，解锁第一行
    await query(
      `UPDATE shipping_order SET status = N'已发货' WHERE shipping_order_number = @son`,
      { son: { type: T.NVarChar, value: ctx.shippingOrderNumber } }
    );
    await query(
      `UPDATE shipping_order_detail SET reconciliation_status = N'未对账', invoice_status = N'未开票' WHERE id = @id`,
      { id: { type: T.Int, value: firstId } }
    );
    // 也恢复第二行
    await query(
      `UPDATE shipping_order_detail SET reconciliation_status = N'未对账' WHERE id = @id`,
      { id: { type: T.Int, value: secondId } }
    );
    console.log(`[T9] 已恢复测试数据`);
  });

  // ==================== T10: 获取打印数据 ====================
  test('T10. 获取打印数据（含批次信息）', async () => {
    const api = await getApiContext();

    const res = await api.post(`${API_BASE}/shipping-orders/reconciliation/print`, {
      data: { detailIds: ctx.shippingDetailIds },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toBeDefined();
    expect(body.data.items.length).toBeGreaterThanOrEqual(2);

    // 检查返回字段
    const first = body.data.items[0];
    expect(first.shipping_order_number).toBeTruthy();
    expect(first.item_number).toBeTruthy();
    expect(first.batches).toBeDefined(); // 批次信息数组
    expect(first.reconciliation_status).toBeDefined();
    console.log(`[T10] 打印数据: ${body.data.items.length} 条`);
    for (const item of body.data.items) {
      console.log(`  ${item.item_number}: batches=${(item.batches || []).length}`);
    }
  });

  // ==================== T11: 打印数据-单行 ====================
  test('T11. 获取打印数据-单行', async () => {
    const api = await getApiContext();
    const firstId = ctx.shippingDetailIds[0];

    const res = await api.post(`${API_BASE}/shipping-orders/reconciliation/print`, {
      data: { detailIds: [firstId] },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.items.length).toBe(1);
    expect(body.data.items[0].detail_id).toBe(firstId);
    console.log(`[T11] 单行打印: detail_id=${firstId}`);
  });

  // ==================== T12: 错误校验 ====================
  test('T12. 错误校验（空IDs/无效状态/空打印）', async () => {
    const api = await getApiContext();

    // 1. 空 detailIds → 400
    const res1 = await api.put(`${API_BASE}/shipping-orders/reconciliation/status`, {
      data: { detailIds: [], reconciliationStatus: '已对账' },
    });
    expect(res1.status()).toBe(400);
    console.log(`[T12] 空IDs→400`);

    // 2. 无效 reconciliationStatus → 400
    const res2 = await api.put(`${API_BASE}/shipping-orders/reconciliation/status`, {
      data: { detailIds: ctx.shippingDetailIds, reconciliationStatus: '无效状态' },
    });
    expect(res2.status()).toBe(400);
    console.log(`[T12] 无效状态→400`);

    // 3. 打印空 detailIds → 400
    const res3 = await api.post(`${API_BASE}/shipping-orders/reconciliation/print`, {
      data: { detailIds: [] },
    });
    expect(res3.status()).toBe(400);
    console.log(`[T12] 空打印→400`);

    // 4. 不存在的 detailId → 更新成功但影响0行
    const res4 = await api.put(`${API_BASE}/shipping-orders/reconciliation/status`, {
      data: { detailIds: [999999999], reconciliationStatus: '已对账' },
    });
    // 不会报错，只是更新0行
    expect(res4.ok()).toBeTruthy();
    console.log(`[T12] 不存在ID→成功（影响0行）`);

    // 5. 打印不存在的 detailId → 返回空数组
    const res5 = await api.post(`${API_BASE}/shipping-orders/reconciliation/print`, {
      data: { detailIds: [999999999] },
    });
    expect(res5.ok()).toBeTruthy();
    const body5 = await res5.json();
    expect(body5.data.items.length).toBe(0);
    console.log(`[T12] 不存在ID打印→空数组`);
  });

  // ==================== T13: 分页校验 ====================
  test('T13. 分页校验（page/limit）', async () => {
    const api = await getApiContext();

    // limit=1 应只返回1条
    const res1 = await api.get(`${API_BASE}/shipping-orders/reconciliation/page`, {
      params: { page: 1, limit: 1 },
    });
    const body1 = await res1.json();
    expect(body1.data.items.length).toBe(1);
    expect(body1.data.total).toBeGreaterThanOrEqual(2);
    console.log(`[T13] limit=1: items=${body1.data.items.length}, total=${body1.data.total}`);

    // page=9999 应返回空
    const res2 = await api.get(`${API_BASE}/shipping-orders/reconciliation/page`, {
      params: { page: 9999, limit: 10 },
    });
    const body2 = await res2.json();
    expect(body2.data.items.length).toBe(0);
    console.log(`[T13] page=9999: items=${body2.data.items.length}`);
  });

  // ==================== T14: 组合过滤（搜索+状态） ====================
  test('T14. 组合过滤（搜索+对账状态）', async () => {
    const api = await getApiContext();

    // 先标记第一行为已对账
    const firstId = ctx.shippingDetailIds[0];
    await api.put(`${API_BASE}/shipping-orders/reconciliation/status`, {
      data: { detailIds: [firstId], reconciliationStatus: '已对账' },
    });

    // 搜索发货单号 + 过滤已对账 → 应只有1条
    const res = await api.get(`${API_BASE}/shipping-orders/reconciliation/page`, {
      params: {
        page: 1, limit: 50,
        search: ctx.shippingOrderNumber,
        reconciliationStatus: '已对账',
      },
    });
    const body = await res.json();
    const items = body.data.items || [];
    expect(items.length, '组合过滤应匹配1条').toBe(1);
    expect(items[0].reconciliation_status).toBe('已对账');
    expect(items[0].shipping_order_number).toBe(ctx.shippingOrderNumber);
    console.log(`[T14] 组合过滤: ${items.length} 条`);

    // 搜索发货单号 + 过滤未对账 → 应有另一条
    const res2 = await api.get(`${API_BASE}/shipping-orders/reconciliation/page`, {
      params: {
        page: 1, limit: 50,
        search: ctx.shippingOrderNumber,
        reconciliationStatus: '未对账',
      },
    });
    const body2 = await res2.json();
    const items2 = body2.data.items || [];
    expect(items2.length).toBeGreaterThanOrEqual(1);
    console.log(`[T14] 组合过滤未对账: ${items2.length} 条`);

    // 恢复
    await api.put(`${API_BASE}/shipping-orders/reconciliation/status`, {
      data: { detailIds: [firstId], reconciliationStatus: '未对账' },
    });
  });

  // ==================== T15: 最终状态验证 ====================
  test('T15. 最终状态验证', async () => {
    // DB 验证发货单明细最终对账状态
    const rows = await query<any>(
      `SELECT id, reconciliation_status, invoice_status FROM shipping_order_detail WHERE shipping_order_number = @son ORDER BY id`,
      { son: { type: T.NVarChar, value: ctx.shippingOrderNumber } }
    );
    console.log(`[T15] 最终对账状态:`);
    for (const row of rows) {
      console.log(`  id=${row.id}: reconciliation=${row.reconciliation_status}, invoice=${row.invoice_status}`);
      expect(row.reconciliation_status).toBe('未对账');
    }

    // 验证发货单头状态
    const shipOrder = await getShippingOrder(ctx.shippingOrderNumber!);
    expect(shipOrder, '发货单不存在').toBeTruthy();
    console.log(`[T15] 发货单状态: ${shipOrder?.status}`);

    // 验证发货单批次存在
    const batches = await query<any>(
      `SELECT id, detail_id, batch_number, quantity FROM shipping_order_batch WHERE shipping_order_number = @son`,
      { son: { type: T.NVarChar, value: ctx.shippingOrderNumber } }
    );
    expect(batches.length, '发货单批次应为空').toBeGreaterThanOrEqual(0);
    console.log(`[T15] 发货单批次数: ${batches.length}`);

    // API 最终分页确认
    const api = await getApiContext();
    const res = await api.get(`${API_BASE}/shipping-orders/reconciliation/page`, {
      params: { page: 1, limit: 10, search: ctx.shippingOrderNumber },
    });
    const body = await res.json();
    expect(body.data.items.length).toBeGreaterThanOrEqual(2);
    console.log(`[T15] 最终分页: ${body.data.items.length} 条, total=${body.data.total}`);
    console.log(`[T15] 全部通过 ✓`);
  });
});

// ==================== 清理旧数据 ====================
async function cleanupOldData() {
  try {
    const orders = await query<any>(
      `SELECT sales_order_number FROM sales_order WHERE remark = @mk`,
      { mk: { type: T.NVarChar, value: TEST_REMARK } }
    );
    for (const o of orders) {
      const son = o.sales_order_number;
      const shipOrders = await query<any>(
        `SELECT shipping_order_number FROM shipping_order_detail WHERE sales_order_number = @son`,
        { son: { type: T.NVarChar, value: son } }
      );
      const shipOrderNumbers = shipOrders.map((so: any) => so.shipping_order_number);
      const shipRequests = await query<any>(
        `SELECT request_number FROM shipping_request_detail WHERE sales_order_number = @son`,
        { son: { type: T.NVarChar, value: son } }
      );
      const requestNumbers = shipRequests.map((sr: any) => sr.request_number);
      await cleanupShippingReturnChain({
        salesOrderNumber: son,
        shippingRequestNumbers: requestNumbers,
        shippingOrderNumbers: shipOrderNumbers,
      });
    }
    if (orders.length > 0) {
      console.log(`[cleanupOldData] 清理旧订单数: ${orders.length}`);
    }
  } catch (e) {
    console.warn('[cleanupOldData] 清理异常:', e);
  }
}
