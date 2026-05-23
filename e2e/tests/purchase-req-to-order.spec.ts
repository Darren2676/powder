/**
 * 采购申请 → 转采购订单（合并/不合并） → 删除采购订单 → 状态回写 E2E 测试
 *
 * 全程使用 API 驱动，数据库断言，确保稳定可靠：
 *   1. 通过 API 创建采购申请（含2条相同物料+1条不同物料）
 *   2. 审批通过
 *   3. 转采购订单（合并模式）→ 验证合并结果 + 状态变化
 *   4. 删除采购订单 → 验证状态回写（未执行、ordered_quantity归零）
 *   5. 再次转采购订单（不合并模式）→ 验证3行独立明细
 *   6. 再次删除采购订单 → 验证状态完全回归
 */
import { test, expect } from '@playwright/test';
import {
  apiLogin, getApiContext, submitAndApprove,
  disposeApiContext, purchaseReqToOrderAPI, reverseApproval
} from '../helpers/api.helper';
import {
  query, T,
  getPurchaseReq, getPurchaseReqDetails,
  getPurchaseOrder, getLatestPurchaseOrderByReq,
  cleanupTestPurchaseReqs
} from '../helpers/db.helper';

const API_BASE = 'http://localhost:3000/api/v1';
const TEST_MARKER = `E2E-PR-TO-PO-${Date.now()}`;

// 测试物料：两条相同 + 一条不同
const ITEM_SAME = 'C100809';
const ITEM_DIFF = 'C100810';
const TEST_SUPPLIER = { number: 'GYS001', name: '测试供应商' };

test.describe.serial('采购申请转采购订单 + 删除回写', () => {
  let ctx: Awaited<ReturnType<typeof getApiContext>>;
  let purchaseReqNumber: string;

  test.beforeAll(async () => {
    await apiLogin();
    ctx = await getApiContext();
    await cleanupTestPurchaseReqs(TEST_MARKER);
  });

  test.afterAll(async () => {
    await cleanupTestPurchaseReqs(TEST_MARKER);
    await disposeApiContext();
  });

  // ==================== Step 1: 创建采购申请 ====================
  test('1. 创建采购申请（含相同物料编码明细）', async () => {
    const res = await ctx.post(`${API_BASE}/purchase-reqs`, {
      data: {
        request_date: new Date().toISOString().split('T')[0],
        request_department: 'E2E测试部',
        requester: 'admin',
        request_reason: '生产缺料',
        remark: TEST_MARKER,
        details: [
          { item_number: ITEM_SAME, item_name: 'E2E测试物料A', basic_unit: '个', request_quantity: 100, expected_date: '2026-06-30' },
          { item_number: ITEM_SAME, item_name: 'E2E测试物料A', basic_unit: '个', request_quantity: 200, expected_date: '2026-06-30' },
          { item_number: ITEM_DIFF, item_name: 'E2E测试物料B', basic_unit: '个', request_quantity: 50,  expected_date: '2026-06-30' },
        ]
      }
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    purchaseReqNumber = body?.data?.purchase_req_number || body?.data?.header?.purchase_req_number;
    expect(purchaseReqNumber).toBeDefined();
    console.log(`[E2E] 创建采购申请: ${purchaseReqNumber}`);

    // 验证明细
    const details = await getPurchaseReqDetails(purchaseReqNumber);
    expect(details.length).toBe(3);
    // 初始状态：未执行，ordered_quantity = 0
    for (const d of details) {
      expect(d.status).toBe('未执行');
      expect(parseFloat(d.ordered_quantity)).toBeCloseTo(0, 1);
    }
    const req = await getPurchaseReq(purchaseReqNumber);
    expect(req!.approval_status).toBe('草稿');
    expect(req!.order_status).toBe('未执行');
  });

  // ==================== Step 2: 审批通过 ====================
  test('2. 审批采购申请', async () => {
    await submitAndApprove('purchase_req', purchaseReqNumber);

    const req = await getPurchaseReq(purchaseReqNumber);
    expect(req!.approval_status).toBe('已审批');
    console.log(`[E2E] 审批通过: ${purchaseReqNumber}`);
  });

  // ==================== Step 3: 转采购订单（合并模式） ====================
  test('3. 转采购订单 - 合并模式', async () => {
    const details = await getPurchaseReqDetails(purchaseReqNumber);
    const detailIds = details.map((d: any) => d.id);

    const result = await purchaseReqToOrderAPI(purchaseReqNumber, {
      detail_ids: detailIds,
      supplier_number: TEST_SUPPLIER.number,
      supplier_name: TEST_SUPPLIER.name,
      procurement_manager: 'E2E测试',
      merge_same_items: true
    });

    const poNumber = result?.purchase_order_number;
    expect(poNumber).toBeDefined();
    console.log(`[E2E] 转采购订单(合并): ${poNumber}`);

    // 验证：采购订单明细只有2行（C100809合并=300, C100810=50）
    const po = await getPurchaseOrder(poNumber);
    expect(po.details.length).toBe(2);

    const mergedRow = po.details.find((d: any) => d.item_number === ITEM_SAME);
    expect(mergedRow).toBeDefined();
    expect(parseFloat(mergedRow!.order_quantity)).toBeCloseTo(300, 1);

    const normalRow = po.details.find((d: any) => d.item_number === ITEM_DIFF);
    expect(normalRow).toBeDefined();
    expect(parseFloat(normalRow!.order_quantity)).toBeCloseTo(50, 1);

    // 验证：采购申请明细 → 已转单
    const reqDetails = await getPurchaseReqDetails(purchaseReqNumber);
    for (const d of reqDetails) {
      expect(d.status).toBe('已转单');
      expect(parseFloat(d.ordered_quantity)).toBeGreaterThan(0);
    }

    // 验证：采购申请主表 → 已转单
    const req = await getPurchaseReq(purchaseReqNumber);
    expect(req!.order_status).toBe('已转单');
    console.log(`[E2E] 合并转单验证通过: 订单${poNumber} = 2行(合并), 申请明细=已转单`);
  });

  // ==================== Step 4: 删除采购订单 → 验证状态回写 ====================
  test('4. 删除采购订单 → 验证采购申请状态回写', async () => {
    const poHeader = await getLatestPurchaseOrderByReq(purchaseReqNumber);
    expect(poHeader).not.toBeNull();
    const poNumber = poHeader!.purchase_order_number;
    console.log(`[E2E] 准备删除采购订单: ${poNumber}`);

    // 改为草稿状态以允许删除
    await query(
      `UPDATE purchase_order SET approval_status = N'草稿' WHERE purchase_order_number = @pon`,
      { pon: { type: T.NVarChar, value: poNumber } }
    );

    // 删除采购订单
    const deleteRes = await ctx.delete(`${API_BASE}/purchase-orders/${poNumber}`);
    expect(deleteRes.ok()).toBeTruthy();
    console.log(`[E2E] 采购订单已删除: ${poNumber}`);

    // 验证：采购申请明细行状态回归 "未执行"，ordered_quantity 归零
    const reqDetails = await getPurchaseReqDetails(purchaseReqNumber);
    for (const d of reqDetails) {
      expect(d.status).toBe('未执行');
      expect(parseFloat(d.ordered_quantity)).toBeCloseTo(0, 1);
    }

    // 验证：采购申请主表执行状态回归 "未执行"
    const req = await getPurchaseReq(purchaseReqNumber);
    expect(req!.order_status).toBe('未执行');
    console.log(`[E2E] 状态回写验证通过: 明细=未执行, qty=0, 主表=未执行`);
  });

  // ==================== Step 5: 再次转采购订单（不合并模式） ====================
  test('5. 再次转采购订单 - 不合并模式', async () => {
    const details = await getPurchaseReqDetails(purchaseReqNumber);
    const detailIds = details.map((d: any) => d.id);

    const result = await purchaseReqToOrderAPI(purchaseReqNumber, {
      detail_ids: detailIds,
      supplier_number: TEST_SUPPLIER.number,
      supplier_name: TEST_SUPPLIER.name,
      procurement_manager: 'E2E测试',
      merge_same_items: false
    });

    const poNumber = result?.purchase_order_number;
    expect(poNumber).toBeDefined();
    console.log(`[E2E] 转采购订单(不合并): ${poNumber}`);

    // 验证：采购订单明细有3行（每条明细行独立）
    const po = await getPurchaseOrder(poNumber);
    expect(po.details.length).toBe(3);

    // 验证同物料两行各自独立
    const sameItemRows = po.details.filter((d: any) => d.item_number === ITEM_SAME);
    expect(sameItemRows.length).toBe(2);
    expect(parseFloat(sameItemRows[0].order_quantity)).toBeCloseTo(100, 1);
    expect(parseFloat(sameItemRows[1].order_quantity)).toBeCloseTo(200, 1);

    const diffItemRow = po.details.find((d: any) => d.item_number === ITEM_DIFF);
    expect(diffItemRow).toBeDefined();
    expect(parseFloat(diffItemRow!.order_quantity)).toBeCloseTo(50, 1);

    // 验证：采购申请明细 → 已转单
    const reqDetails = await getPurchaseReqDetails(purchaseReqNumber);
    for (const d of reqDetails) {
      expect(d.status).toBe('已转单');
    }

    const req = await getPurchaseReq(purchaseReqNumber);
    expect(req!.order_status).toBe('已转单');
    console.log(`[E2E] 不合并转单验证通过: 订单${poNumber} = 3行(独立), 申请=已转单`);
  });

  // ==================== Step 6: 再次删除 → 验证状态完全回归 ====================
  test('6. 再次删除采购订单 → 验证状态完全回归', async () => {
    const poHeader = await getLatestPurchaseOrderByReq(purchaseReqNumber);
    expect(poHeader).not.toBeNull();
    const poNumber = poHeader!.purchase_order_number;

    // 改为草稿
    await query(
      `UPDATE purchase_order SET approval_status = N'草稿' WHERE purchase_order_number = @pon`,
      { pon: { type: T.NVarChar, value: poNumber } }
    );

    // 删除
    const deleteRes = await ctx.delete(`${API_BASE}/purchase-orders/${poNumber}`);
    expect(deleteRes.ok()).toBeTruthy();

    // 验证状态完全回归
    const reqDetails = await getPurchaseReqDetails(purchaseReqNumber);
    for (const d of reqDetails) {
      expect(d.status).toBe('未执行');
      expect(parseFloat(d.ordered_quantity)).toBeCloseTo(0, 1);
    }

    const req = await getPurchaseReq(purchaseReqNumber);
    expect(req!.order_status).toBe('未执行');
    console.log(`[E2E] 二次删除后状态完全回归验证通过`);
  });
});

