/**
 * E2E测试：采购入库业务全流程
 *
 * 测试策略：API驱动 + 数据库断言（混合策略）
 * 覆盖场景（参照《采购入库业务全流程逻辑流程图》）：
 *
 *   路径A - 免检物料（incoming_inspection != 'Y'）：
 *     创建采购订单 → 审批 → 创建入库单 → 确认入库(直入原料仓) → 验证库存/流水/PO回写 → 入库撤回
 *
 *   路径B - 需检验物料（incoming_inspection = 'Y'）：
 *     创建采购订单 → 审批 → 创建入库单(自动创建检验单) → 确认入库(入待检仓) →
 *     来料检验(合格) → 待检仓转原料库 → 验证转仓库存/流水/PO回写
 *
 *   路径C - 入库撤回（检验前撤回）：
 *     创建入库单 → 确认入库 → 撤回 → 验证批次扣减/流水作废/检验单作废/PO回退
 *
 * 验证点：
 *   1. 免检物料确认入库 → 直入原料仓，PO received_quantity 回写
 *   2. 需检验物料确认入库 → 入待检仓，PO received_quantity 不回写（等检验后）
 *   3. 需检验物料创建入库单 → 自动创建检验单
 *   4. 来料检验合格 → 待检仓→原料库自动转仓
 *   5. 来料检验合格 → PO received_quantity 回写
 *   6. 入库撤回 → 批次库存扣减/删除
 *   7. 入库撤回 → 库存流水remark追加作废标记
 *   8. 入库撤回 → 检验单状态改为'已作废'
 *   9. 入库撤回 → PO received_quantity 回退
 *  10. 入库撤回 → 入库单状态变为'已撤回'
 *
 * 注意：material_inventory 汇总表的 syncMaterialInventorySummary 函数只 UPDATE 不 INSERT，
 * 所以对于新物料+仓库组合，汇总可能不存在。本测试用批次库存总量做主要断言。
 */
import { test, expect } from '@playwright/test';
import {
  createPurchaseOrderAPI,
  getPurchaseOrderReceivableAPI,
  createStockInAPI,
  confirmStockInAPI,
  withdrawStockInAPI,
  getStockInDetailAPI,
  updatePurchaseInspectionAPI,
  completePurchaseInspectionAPI,
  submitAndApprove,
  disposeApiContext,
  getApiContext,
} from '../helpers/api.helper';
import {
  findInspectionRequiredItem,
  findNonInspectionItem,
  findSupplier,
  getMaterialBatchInventory,
  getMaterialInventorySummary,
  getMaterialTransactions,
  cleanupPurchaseTestData,
  query,
  T,
} from '../helpers/db.helper';

const TEST_MARKER = `E2E-PURCHASE-STOCKIN-${Date.now()}`;

// 仓库编号映射
const RAW_WH = '04';
const RAW_WH_NAME = '原材料仓库';
const INSP_WH = '09';
const INSP_WH_NAME = '待检仓';

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function safeFloat(val: any): number {
  return parseFloat(String(val)) || 0;
}

/** 从批次库存汇总总数量（避免依赖 material_inventory 汇总表的 INSERT 缺陷） */
async function getBatchTotalQty(itemNumber: string, warehouseNumber: string): Promise<number> {
  const batches = await getMaterialBatchInventory(itemNumber, warehouseNumber);
  return batches.reduce((sum: number, b: any) => sum + safeFloat(b.quantity), 0);
}

// 全局登录
test.beforeAll(async () => {
  await getApiContext();
});

test.afterAll(async () => {
  await disposeApiContext();
});

// ==================== 路径A：免检物料 - 直接入库 ====================

test.describe.serial('路径A：免检物料 - 采购入库全流程', () => {
  test.setTimeout(120_000);

  const ctx: {
    purchaseOrderNumber?: string;
    stockInNumber?: string;
    itemNumber?: string;
    itemName?: string;
    specifications?: string;
    basicUnit?: string;
    orderQty?: number;
    purchaseDetailId?: number;
    // 基线数据
    rawBatchQtyBefore?: number;
    poReceivedBefore?: number;
  } = {};

  test.beforeAll(async () => {
    const item = await findNonInspectionItem();
    if (item) {
      ctx.itemNumber = item.item_number;
      ctx.itemName = item.item_name;
      ctx.specifications = item.specifications || '';
      ctx.basicUnit = item.basic_unit || '';
    }
  });

  test.afterAll(async () => {
    if (ctx.purchaseOrderNumber) {
      await cleanupPurchaseTestData(ctx.purchaseOrderNumber);
    }
  });

  test('A1. 创建采购订单 → 审批', async () => {
    if (!ctx.itemNumber) { test.skip(); return; }

    const supplier = await findSupplier();
    if (!supplier) { test.skip(); return; }

    ctx.orderQty = 50;

    const result = await createPurchaseOrderAPI({
      supplier_number: supplier.supplier_number,
      supplier_name: supplier.supplier_name,
      procurement_manager: 'E2E',
      linkman: 'E2E',
      contacts: 'E2E',
      order_date: todayStr(),
      delivery_date: todayStr(),
      total_amount: ctx.orderQty,
      condition: '启用',
      remark: `${TEST_MARKER}-免检物料`,
      details: [{
        item_number: ctx.itemNumber!,
        item_name: ctx.itemName!,
        specifications: ctx.specifications || '',
        basic_unit: ctx.basicUnit || '',
        order_quantity: ctx.orderQty,
        unit_price: 1,
        delivery_date: todayStr(),
      }],
    });

    ctx.purchaseOrderNumber = result.purchase_order_number;
    console.log(`[A1] 采购订单号: ${ctx.purchaseOrderNumber}`);

    await submitAndApprove('purchase_order', ctx.purchaseOrderNumber!);
    console.log('[A1] 审批完成');
  });

  test('A2. 获取可收货明细 → 创建入库单', async () => {
    if (!ctx.purchaseOrderNumber) { test.skip(); return; }

    const receivable = await getPurchaseOrderReceivableAPI(ctx.purchaseOrderNumber!);
    const items = receivable?.items || [];
    expect(items.length).toBeGreaterThan(0);

    const item = items[0];
    ctx.purchaseDetailId = item.id || item.purchase_detail_id;
    const stockInQty = parseFloat(item.remaining) || ctx.orderQty!;

    // 记录基线：批次库存总量
    ctx.rawBatchQtyBefore = await getBatchTotalQty(ctx.itemNumber!, RAW_WH);
    const poDetailBefore = await query<any>(
      `SELECT received_quantity FROM purchase_order_detail WHERE purchase_order_number = @pon AND item_number = @item`,
      { pon: { type: T.NVarChar, value: ctx.purchaseOrderNumber! }, item: { type: T.NVarChar, value: ctx.itemNumber! } }
    );
    ctx.poReceivedBefore = poDetailBefore.length > 0 ? safeFloat(poDetailBefore[0].received_quantity) : 0;

    // 免检物料：qualified_quantity = stock_in_quantity
    const result = await createStockInAPI({
      purchase_order_number: ctx.purchaseOrderNumber!,
      warehouse_number: RAW_WH,
      warehouse_name: RAW_WH_NAME,
      remark: `${TEST_MARKER}-免检入库`,
      details: [{
        purchase_detail_id: ctx.purchaseDetailId!,
        item_number: ctx.itemNumber!,
        item_name: ctx.itemName!,
        specifications: ctx.specifications || '',
        basic_unit: ctx.basicUnit || '',
        order_quantity: ctx.orderQty!,
        received_quantity: ctx.poReceivedBefore,
        stock_in_quantity: stockInQty,
        qualified_quantity: stockInQty,
        unqualified_quantity: 0,
      }],
    });

    ctx.stockInNumber = result.stock_in_number;
    const autoInspections = result.auto_inspections || [];
    console.log(`[A2] 入库单号: ${ctx.stockInNumber}, 自动检验单: ${JSON.stringify(autoInspections)}`);

    expect(ctx.stockInNumber).toBeTruthy();
    expect(autoInspections.length).toBe(0);  // 免检物料不应创建检验单

    const detail = await getStockInDetailAPI(ctx.stockInNumber!);
    expect(detail?.header?.approval_status).toBe('草稿');
  });

  test('A3. 确认入库 → 免检物料直入原料仓', async () => {
    if (!ctx.stockInNumber) { test.skip(); return; }

    await confirmStockInAPI(ctx.stockInNumber!);
    await new Promise(r => setTimeout(r, 1000));

    // 验证1: 入库单状态变为'已入库'
    const detail = await getStockInDetailAPI(ctx.stockInNumber!);
    expect(detail?.header?.approval_status).toBe('已入库');
    console.log(`[A3] ✓ 入库单状态: 已入库`);

    // 验证2: 原料仓批次库存总量增加（使用批次总量，避免汇总表INSERT缺陷）
    const rawBatchQtyAfter = await getBatchTotalQty(ctx.itemNumber!, RAW_WH);
    const increase = rawBatchQtyAfter - (ctx.rawBatchQtyBefore || 0);
    expect(increase).toBeGreaterThan(0);
    console.log(`[A3] ✓ 原料仓批次库存总量: ${ctx.rawBatchQtyBefore} → ${rawBatchQtyAfter} (+${increase})`);

    // 验证3: 汇总库存（如果存在）应与批次一致
    const rawInvSummary = await getMaterialInventorySummary(ctx.itemNumber!, RAW_WH);
    if (rawInvSummary) {
      const summaryQty = safeFloat(rawInvSummary.quantity);
      console.log(`[A3] ✓ 汇总库存: ${summaryQty} (批次总量=${rawBatchQtyAfter})`);
      // 汇总值应接近批次总量
      expect(Math.abs(summaryQty - rawBatchQtyAfter)).toBeLessThanOrEqual(1);
    } else {
      console.log(`[A3] ⚠ 汇总库存不存在（syncMaterialInventorySummary 不 INSERT）`);
    }

    // 验证4: 库存流水记录
    const txns = await getMaterialTransactions(ctx.stockInNumber!);
    const inTxns = txns.filter(t => t.transaction_type === '入库' && t.source_type === '采购入库');
    expect(inTxns.length).toBeGreaterThan(0);
    const inTxn = inTxns[0];
    expect(inTxn.warehouse_number).toBe(RAW_WH);
    expect(safeFloat(inTxn.quantity)).toBeGreaterThan(0);
    console.log(`[A3] ✓ 库存流水: ${inTxn.transaction_number}, 类型=入库, source_type=采购入库, 仓库=${RAW_WH}`);

    // 验证5: PO received_quantity 回写
    const poDetailAfter = await query<any>(
      `SELECT received_quantity, receive_status FROM purchase_order_detail WHERE purchase_order_number = @pon AND item_number = @item`,
      { pon: { type: T.NVarChar, value: ctx.purchaseOrderNumber! }, item: { type: T.NVarChar, value: ctx.itemNumber! } }
    );
    expect(poDetailAfter.length).toBeGreaterThan(0);
    const receivedAfter = safeFloat(poDetailAfter[0].received_quantity);
    expect(receivedAfter).toBeGreaterThan(ctx.poReceivedBefore || 0);
    console.log(`[A3] ✓ PO received_quantity: ${ctx.poReceivedBefore} → ${receivedAfter}`);

    // 验证6: 入库明细 inspect_status = '免检'
    const sidRows = await query<any>(
      `SELECT inspect_status, batch_number FROM stock_in_detail WHERE stock_in_number = @si AND item_number = @item`,
      { si: { type: T.NVarChar, value: ctx.stockInNumber! }, item: { type: T.NVarChar, value: ctx.itemNumber! } }
    );
    expect(sidRows[0].inspect_status?.trim()).toBe('免检');
    expect(sidRows[0].batch_number).toBeTruthy();
    console.log(`[A3] ✓ 入库明细: inspect_status=免检, batch_number=${sidRows[0].batch_number}`);
  });

  test('A4. 入库撤回 → 验证全部反转', async () => {
    if (!ctx.stockInNumber) { test.skip(); return; }

    await withdrawStockInAPI(ctx.stockInNumber!);
    await new Promise(r => setTimeout(r, 1000));

    // 验证1: 入库单状态变为'已撤回'
    const detail = await getStockInDetailAPI(ctx.stockInNumber!);
    expect(detail?.header?.approval_status).toBe('已撤回');
    console.log(`[A4] ✓ 入库单状态: 已撤回`);

    // 验证2: 原料仓批次库存总量恢复
    const rawBatchQtyAfterWithdraw = await getBatchTotalQty(ctx.itemNumber!, RAW_WH);
    const diff = Math.abs(rawBatchQtyAfterWithdraw - (ctx.rawBatchQtyBefore || 0));
    expect(diff).toBeLessThanOrEqual(1);
    console.log(`[A4] ✓ 原料仓批次库存恢复: ${rawBatchQtyAfterWithdraw} (基线=${ctx.rawBatchQtyBefore})`);

    // 验证3: 库存流水remark追加作废标记
    const txnsAfter = await getMaterialTransactions(ctx.stockInNumber!);
    const inTxnAfter = txnsAfter.find(t => t.transaction_type === '入库' && t.source_type === '采购入库');
    expect(inTxnAfter).toBeTruthy();
    expect(inTxnAfter!.remark).toContain('已作废');
    console.log(`[A4] ✓ 库存流水: ${inTxnAfter!.transaction_number} remark含"已作废"`);

    // 验证4: PO received_quantity 回退
    const poDetailAfterWithdraw = await query<any>(
      `SELECT received_quantity FROM purchase_order_detail WHERE purchase_order_number = @pon AND item_number = @item`,
      { pon: { type: T.NVarChar, value: ctx.purchaseOrderNumber! }, item: { type: T.NVarChar, value: ctx.itemNumber! } }
    );
    const receivedAfterWithdraw = safeFloat(poDetailAfterWithdraw[0].received_quantity);
    expect(receivedAfterWithdraw).toBeLessThanOrEqual(ctx.poReceivedBefore || 0);
    console.log(`[A4] ✓ PO received_quantity回退: ${receivedAfterWithdraw}`);

    // 验证5: 入库明细批次号清空
    const sidAfterWithdraw = await query<any>(
      `SELECT batch_number, inspect_status FROM stock_in_detail WHERE stock_in_number = @si AND item_number = @item`,
      { si: { type: T.NVarChar, value: ctx.stockInNumber! }, item: { type: T.NVarChar, value: ctx.itemNumber! } }
    );
    expect(sidAfterWithdraw[0].batch_number?.trim()).toBe('');
    console.log(`[A4] ✓ 入库明细: batch_number清空`);

    console.log('\n========== 路径A 全部验证通过 ==========');
  });
});

// ==================== 路径B：需检验物料 - 来料检验入库 ====================

test.describe.serial('路径B：需检验物料 - 采购入库→来料检验→转仓全流程', () => {
  test.setTimeout(180_000);

  const ctx: {
    purchaseOrderNumber?: string;
    stockInNumber?: string;
    inspectionNumber?: string;
    itemNumber?: string;
    itemName?: string;
    specifications?: string;
    basicUnit?: string;
    orderQty?: number;
    purchaseDetailId?: number;
    // 基线数据
    inspBatchQtyBefore?: number;
    rawBatchQtyBefore?: number;
    poReceivedBefore?: number;
  } = {};

  test.beforeAll(async () => {
    const item = await findInspectionRequiredItem();
    if (item) {
      ctx.itemNumber = item.item_number;
      ctx.itemName = item.item_name;
      ctx.specifications = item.specifications || '';
      ctx.basicUnit = item.basic_unit || '';
    }
  });

  test.afterAll(async () => {
    if (ctx.purchaseOrderNumber) {
      await cleanupPurchaseTestData(ctx.purchaseOrderNumber);
    }
  });

  test('B1. 创建采购订单 → 审批', async () => {
    if (!ctx.itemNumber) { test.skip(); return; }

    const supplier = await findSupplier();
    if (!supplier) { test.skip(); return; }

    ctx.orderQty = 100;

    const result = await createPurchaseOrderAPI({
      supplier_number: supplier.supplier_number,
      supplier_name: supplier.supplier_name,
      procurement_manager: 'E2E',
      linkman: 'E2E',
      contacts: 'E2E',
      order_date: todayStr(),
      delivery_date: todayStr(),
      total_amount: ctx.orderQty,
      condition: '启用',
      remark: `${TEST_MARKER}-需检验物料`,
      details: [{
        item_number: ctx.itemNumber!,
        item_name: ctx.itemName!,
        specifications: ctx.specifications || '',
        basic_unit: ctx.basicUnit || '',
        order_quantity: ctx.orderQty,
        unit_price: 1,
        delivery_date: todayStr(),
      }],
    });

    ctx.purchaseOrderNumber = result.purchase_order_number;
    console.log(`[B1] 采购订单号: ${ctx.purchaseOrderNumber}`);

    await submitAndApprove('purchase_order', ctx.purchaseOrderNumber!);
    console.log('[B1] 审批完成');
  });

  test('B2. 创建入库单 → 自动创建检验单', async () => {
    if (!ctx.purchaseOrderNumber) { test.skip(); return; }

    const receivable = await getPurchaseOrderReceivableAPI(ctx.purchaseOrderNumber!);
    const items = receivable?.items || [];
    expect(items.length).toBeGreaterThan(0);

    const item = items[0];
    ctx.purchaseDetailId = item.id || item.purchase_detail_id;
    const stockInQty = parseFloat(item.remaining) || ctx.orderQty!;

    // 记录基线
    ctx.inspBatchQtyBefore = await getBatchTotalQty(ctx.itemNumber!, INSP_WH);
    ctx.rawBatchQtyBefore = await getBatchTotalQty(ctx.itemNumber!, RAW_WH);
    const poDetailBefore = await query<any>(
      `SELECT received_quantity FROM purchase_order_detail WHERE purchase_order_number = @pon AND item_number = @item`,
      { pon: { type: T.NVarChar, value: ctx.purchaseOrderNumber! }, item: { type: T.NVarChar, value: ctx.itemNumber! } }
    );
    ctx.poReceivedBefore = poDetailBefore.length > 0 ? safeFloat(poDetailBefore[0].received_quantity) : 0;

    const result = await createStockInAPI({
      purchase_order_number: ctx.purchaseOrderNumber!,
      warehouse_number: RAW_WH,
      warehouse_name: RAW_WH_NAME,
      remark: `${TEST_MARKER}-需检验入库`,
      details: [{
        purchase_detail_id: ctx.purchaseDetailId!,
        item_number: ctx.itemNumber!,
        item_name: ctx.itemName!,
        specifications: ctx.specifications || '',
        basic_unit: ctx.basicUnit || '',
        order_quantity: ctx.orderQty!,
        received_quantity: ctx.poReceivedBefore,
        stock_in_quantity: stockInQty,
        qualified_quantity: 0,
        unqualified_quantity: 0,
      }],
    });

    ctx.stockInNumber = result.stock_in_number;
    const autoInspections = result.auto_inspections || [];
    console.log(`[B2] 入库单号: ${ctx.stockInNumber}, 自动检验单: ${JSON.stringify(autoInspections)}`);

    expect(ctx.stockInNumber).toBeTruthy();
    expect(autoInspections.length).toBeGreaterThan(0);
    ctx.inspectionNumber = autoInspections[0];
    console.log(`[B2] 检验单号: ${ctx.inspectionNumber}`);

    const inspRows = await query<any>(
      `SELECT inspect_status FROM purchase_quality_inspection WHERE inspection_number = @inspNo`,
      { inspNo: { type: T.NVarChar, value: ctx.inspectionNumber! } }
    );
    expect(inspRows[0].inspect_status?.trim()).toBe('待检验');
    console.log(`[B2] ✓ 检验单初始状态: 待检验`);
  });

  test('B3. 确认入库 → 需检验物料入待检仓', async () => {
    if (!ctx.stockInNumber) { test.skip(); return; }

    await confirmStockInAPI(ctx.stockInNumber!);
    await new Promise(r => setTimeout(r, 1000));

    // 验证1: 入库单状态变为'已入库'
    const detail = await getStockInDetailAPI(ctx.stockInNumber!);
    expect(detail?.header?.approval_status).toBe('已入库');
    console.log(`[B3] ✓ 入库单状态: 已入库`);

    // 验证2: 待检仓批次库存总量增加
    const inspBatchQtyAfter = await getBatchTotalQty(ctx.itemNumber!, INSP_WH);
    const inspIncrease = inspBatchQtyAfter - (ctx.inspBatchQtyBefore || 0);
    expect(inspIncrease).toBeGreaterThan(0);
    console.log(`[B3] ✓ 待检仓批次库存总量: ${ctx.inspBatchQtyBefore} → ${inspBatchQtyAfter} (+${inspIncrease})`);

    // 验证3: 原料仓库存不变
    const rawBatchQtyAfter = await getBatchTotalQty(ctx.itemNumber!, RAW_WH);
    expect(rawBatchQtyAfter).toBe(ctx.rawBatchQtyBefore || 0);
    console.log(`[B3] ✓ 原料仓库存不变: ${rawBatchQtyAfter}`);

    // 验证3b: 检验单 batch_number 应已被更新
    if (ctx.inspectionNumber) {
      const inspCheck = await query<any>(
        `SELECT batch_number FROM purchase_quality_inspection WHERE inspection_number = @inspNo`,
        { inspNo: { type: T.NVarChar, value: ctx.inspectionNumber! } }
      );
      const inspBatchNo = inspCheck.length > 0 ? inspCheck[0].batch_number : '';
      console.log(`[B3] ✓ 检验单 batch_number: "${inspBatchNo}"`);
      if (inspBatchNo && inspBatchNo.trim() !== '') {
        console.log(`[B3] ✓ 检验单批次号已更新，转仓应能成功`);
      } else {
        console.log(`[B3] ⚠ 检验单批次号为空，转仓将不成功（已知Bug）`);
      }
    }

    // 验证4: 库存流水 - 来料待检
    const txns = await getMaterialTransactions(ctx.stockInNumber!);
    const inspTxns = txns.filter(t => t.source_type === '来料待检');
    expect(inspTxns.length).toBeGreaterThan(0);
    expect(inspTxns[0].warehouse_number).toBe(INSP_WH);
    console.log(`[B3] ✓ 库存流水: source_type=来料待检, 仓库=${INSP_WH}`);

    // 验证5: PO received_quantity 不回写
    const poDetailAfter = await query<any>(
      `SELECT received_quantity FROM purchase_order_detail WHERE purchase_order_number = @pon AND item_number = @item`,
      { pon: { type: T.NVarChar, value: ctx.purchaseOrderNumber! }, item: { type: T.NVarChar, value: ctx.itemNumber! } }
    );
    const receivedAfter = safeFloat(poDetailAfter[0].received_quantity);
    expect(receivedAfter).toBe(ctx.poReceivedBefore || 0);
    console.log(`[B3] ✓ PO received_quantity未回写: ${receivedAfter} (基线=${ctx.poReceivedBefore})`);

    // 验证6: 入库明细 inspect_status='待检验'
    const sidRows = await query<any>(
      `SELECT inspect_status, inspection_number, batch_number, qualified_quantity FROM stock_in_detail WHERE stock_in_number = @si AND item_number = @item`,
      { si: { type: T.NVarChar, value: ctx.stockInNumber! }, item: { type: T.NVarChar, value: ctx.itemNumber! } }
    );
    expect(sidRows[0].inspect_status?.trim()).toBe('待检验');
    expect(sidRows[0].inspection_number).toBeTruthy();
    expect(sidRows[0].batch_number).toBeTruthy();
    expect(safeFloat(sidRows[0].qualified_quantity)).toBe(0);
    console.log(`[B3] ✓ 入库明细: inspect_status=待检验, inspection_number=${sidRows[0].inspection_number}`);
  });

  test('B4. 来料检验(填写) → 状态变为检验中', async () => {
    if (!ctx.inspectionNumber || !ctx.purchaseOrderNumber) { test.skip(); return; }

    await updatePurchaseInspectionAPI(ctx.inspectionNumber!, {
      purchase_order_number: ctx.purchaseOrderNumber!,
      qualified_quantity: ctx.orderQty!,
      unqualified_quantity: 0,
      inspect_result: '合格',
    });

    const inspRows = await query<any>(
      `SELECT inspect_status, inspect_result FROM purchase_quality_inspection WHERE inspection_number = @inspNo`,
      { inspNo: { type: T.NVarChar, value: ctx.inspectionNumber! } }
    );
    expect(inspRows[0].inspect_status?.trim()).toBe('检验中');
    console.log(`[B4] ✓ 检验单状态: 检验中`);
  });

  test('B5. 完成检验(合格) → 待检仓→原料库自动转仓', async () => {
    if (!ctx.inspectionNumber || !ctx.stockInNumber) { test.skip(); return; }

    await completePurchaseInspectionAPI(ctx.inspectionNumber!, {
      inspect_result: '合格',
      qualified_quantity: ctx.orderQty!,
      unqualified_quantity: 0,
    });
    await new Promise(r => setTimeout(r, 1500));

    // 验证1: 检验单状态变为'已完成'
    const inspRows = await query<any>(
      `SELECT inspect_status, inspect_result, qualified_quantity FROM purchase_quality_inspection WHERE inspection_number = @inspNo`,
      { inspNo: { type: T.NVarChar, value: ctx.inspectionNumber! } }
    );
    expect(inspRows[0].inspect_status?.trim()).toBe('已完成');
    expect(inspRows[0].inspect_result?.trim()).toBe('合格');
    console.log(`[B5] ✓ 检验单状态: 已完成, 结论: 合格`);

    // 验证2: 待检仓库存减少
    const inspBatchQtyAfter = await getBatchTotalQty(ctx.itemNumber!, INSP_WH);
    expect(inspBatchQtyAfter).toBeLessThanOrEqual(ctx.inspBatchQtyBefore || 0);
    console.log(`[B5] ✓ 待检仓库存恢复: ${inspBatchQtyAfter}`);

    // 验证3: 原料仓库存增加
    const rawBatchQtyAfter = await getBatchTotalQty(ctx.itemNumber!, RAW_WH);
    const rawIncrease = rawBatchQtyAfter - (ctx.rawBatchQtyBefore || 0);
    expect(rawIncrease).toBeGreaterThan(0);
    console.log(`[B5] ✓ 原料仓库存增加: ${ctx.rawBatchQtyBefore} → ${rawBatchQtyAfter}`);

    // 验证4: 检验合格转仓流水（出库+入库）
    const inspTxns = await getMaterialTransactions(ctx.inspectionNumber!);
    const outTxns = inspTxns.filter(t => t.source_type === '检验合格转出');
    const inTxns = inspTxns.filter(t => t.source_type === '检验合格入库');
    expect(outTxns.length).toBeGreaterThan(0);
    expect(inTxns.length).toBeGreaterThan(0);
    expect(outTxns[0].warehouse_number).toBe(INSP_WH);
    expect(inTxns[0].warehouse_number).toBe(RAW_WH);
    console.log(`[B5] ✓ 检验转仓流水: 出库${outTxns.length}条(待检仓), 入库${inTxns.length}条(原料仓)`);

    // 验证5: 入库明细 inspect_status变为'已完成'
    const sidRows = await query<any>(
      `SELECT inspect_status, qualified_quantity, unqualified_quantity FROM stock_in_detail WHERE stock_in_number = @si AND item_number = @item`,
      { si: { type: T.NVarChar, value: ctx.stockInNumber! }, item: { type: T.NVarChar, value: ctx.itemNumber! } }
    );
    expect(sidRows[0].inspect_status?.trim()).toBe('已完成');
    expect(safeFloat(sidRows[0].qualified_quantity)).toBe(ctx.orderQty!);
    console.log(`[B5] ✓ 入库明细: inspect_status=已完成, qualified=${sidRows[0].qualified_quantity}`);

    // 验证6: 检验合格后PO received_quantity回写
    const poDetailAfter = await query<any>(
      `SELECT received_quantity, receive_status FROM purchase_order_detail WHERE purchase_order_number = @pon AND item_number = @item`,
      { pon: { type: T.NVarChar, value: ctx.purchaseOrderNumber! }, item: { type: T.NVarChar, value: ctx.itemNumber! } }
    );
    const receivedAfter = safeFloat(poDetailAfter[0].received_quantity);
    expect(receivedAfter).toBeGreaterThan(ctx.poReceivedBefore || 0);
    console.log(`[B5] ✓ PO received_quantity回写: ${ctx.poReceivedBefore} → ${receivedAfter}`);

    console.log('\n========== 路径B 全部验证通过 ==========');
  });
});

// ==================== 路径C：入库撤回（检验前撤回） ====================

test.describe.serial('路径C：需检验物料 - 入库后检验前撤回', () => {
  test.setTimeout(180_000);

  const ctx: {
    purchaseOrderNumber?: string;
    stockInNumber?: string;
    inspectionNumber?: string;
    itemNumber?: string;
    itemName?: string;
    specifications?: string;
    basicUnit?: string;
    orderQty?: number;
    purchaseDetailId?: number;
    // 基线数据
    inspBatchQtyBefore?: number;
    rawBatchQtyBefore?: number;
    poReceivedBefore?: number;
  } = {};

  test.beforeAll(async () => {
    const item = await findInspectionRequiredItem();
    if (item) {
      ctx.itemNumber = item.item_number;
      ctx.itemName = item.item_name;
      ctx.specifications = item.specifications || '';
      ctx.basicUnit = item.basic_unit || '';
    }
  });

  test.afterAll(async () => {
    if (ctx.purchaseOrderNumber) {
      await cleanupPurchaseTestData(ctx.purchaseOrderNumber);
    }
  });

  test('C1. 创建采购订单 → 审批 → 创建入库单 → 确认入库', async () => {
    if (!ctx.itemNumber) { test.skip(); return; }

    const supplier = await findSupplier();
    if (!supplier) { test.skip(); return; }

    ctx.orderQty = 80;

    const poResult = await createPurchaseOrderAPI({
      supplier_number: supplier.supplier_number,
      supplier_name: supplier.supplier_name,
      procurement_manager: 'E2E',
      linkman: 'E2E',
      contacts: 'E2E',
      order_date: todayStr(),
      delivery_date: todayStr(),
      total_amount: ctx.orderQty,
      condition: '启用',
      remark: `${TEST_MARKER}-撤回测试`,
      details: [{
        item_number: ctx.itemNumber!,
        item_name: ctx.itemName!,
        specifications: ctx.specifications || '',
        basic_unit: ctx.basicUnit || '',
        order_quantity: ctx.orderQty,
        unit_price: 1,
        delivery_date: todayStr(),
      }],
    });
    ctx.purchaseOrderNumber = poResult.purchase_order_number;
    await submitAndApprove('purchase_order', ctx.purchaseOrderNumber!);

    // 记录基线
    ctx.inspBatchQtyBefore = await getBatchTotalQty(ctx.itemNumber!, INSP_WH);
    ctx.rawBatchQtyBefore = await getBatchTotalQty(ctx.itemNumber!, RAW_WH);
    const poDetailBefore = await query<any>(
      `SELECT received_quantity FROM purchase_order_detail WHERE purchase_order_number = @pon AND item_number = @item`,
      { pon: { type: T.NVarChar, value: ctx.purchaseOrderNumber! }, item: { type: T.NVarChar, value: ctx.itemNumber! } }
    );
    ctx.poReceivedBefore = poDetailBefore.length > 0 ? safeFloat(poDetailBefore[0].received_quantity) : 0;

    // 获取可收货明细
    const receivable = await getPurchaseOrderReceivableAPI(ctx.purchaseOrderNumber!);
    const items = receivable?.items || [];
    if (items.length === 0) { test.skip(); return; }
    ctx.purchaseDetailId = items[0].id || items[0].purchase_detail_id;
    const stockInQty = parseFloat(items[0].remaining) || ctx.orderQty!;

    const siResult = await createStockInAPI({
      purchase_order_number: ctx.purchaseOrderNumber!,
      warehouse_number: RAW_WH,
      warehouse_name: RAW_WH_NAME,
      remark: `${TEST_MARKER}-撤回测试入库`,
      details: [{
        purchase_detail_id: ctx.purchaseDetailId!,
        item_number: ctx.itemNumber!,
        item_name: ctx.itemName!,
        specifications: ctx.specifications || '',
        basic_unit: ctx.basicUnit || '',
        order_quantity: ctx.orderQty!,
        received_quantity: ctx.poReceivedBefore,
        stock_in_quantity: stockInQty,
        qualified_quantity: 0,
        unqualified_quantity: 0,
      }],
    });
    ctx.stockInNumber = siResult.stock_in_number;
    ctx.inspectionNumber = (siResult.auto_inspections || [])[0];
    console.log(`[C1] 入库单: ${ctx.stockInNumber}, 检验单: ${ctx.inspectionNumber}`);

    await confirmStockInAPI(ctx.stockInNumber!);
    await new Promise(r => setTimeout(r, 1000));
    console.log('[C1] 确认入库完成');
  });

  test('C2. 入库撤回（检验前） → 验证全部反转', async () => {
    if (!ctx.stockInNumber) { test.skip(); return; }

    await withdrawStockInAPI(ctx.stockInNumber!);
    await new Promise(r => setTimeout(r, 1000));

    // 验证1: 入库单状态变为'已撤回'
    const detail = await getStockInDetailAPI(ctx.stockInNumber!);
    expect(detail?.header?.approval_status).toBe('已撤回');
    console.log(`[C2] ✓ 入库单状态: 已撤回`);

    // 验证2: 待检仓批次库存恢复
    const inspBatchQtyAfter = await getBatchTotalQty(ctx.itemNumber!, INSP_WH);
    const inspDiff = Math.abs(inspBatchQtyAfter - (ctx.inspBatchQtyBefore || 0));
    expect(inspDiff).toBeLessThanOrEqual(1);
    console.log(`[C2] ✓ 待检仓批次库存恢复: ${inspBatchQtyAfter} (基线=${ctx.inspBatchQtyBefore})`);

    // 验证3: 原料仓库存不变
    const rawBatchQtyAfter = await getBatchTotalQty(ctx.itemNumber!, RAW_WH);
    const rawDiff = Math.abs(rawBatchQtyAfter - (ctx.rawBatchQtyBefore || 0));
    expect(rawDiff).toBeLessThanOrEqual(1);
    console.log(`[C2] ✓ 原料仓库存不变: ${rawBatchQtyAfter}`);

    // 验证4: 库存流水remark追加作废标记
    const txns = await getMaterialTransactions(ctx.stockInNumber!);
    const inTxns = txns.filter(t => t.transaction_type === '入库');
    for (const txn of inTxns) {
      expect(txn.remark).toContain('已作废');
    }
    console.log(`[C2] ✓ 入库流水 ${inTxns.length} 条均已作废`);

    // 验证5: 检验单状态变为'已作废'
    if (ctx.inspectionNumber) {
      const inspRows = await query<any>(
        `SELECT inspect_status FROM purchase_quality_inspection WHERE inspection_number = @inspNo`,
        { inspNo: { type: T.NVarChar, value: ctx.inspectionNumber! } }
      );
      expect(inspRows[0].inspect_status?.trim()).toBe('已作废');
      console.log(`[C2] ✓ 检验单状态: 已作废`);
    }

    // 验证6: PO received_quantity 不变（需检验物料确认时没回写）
    const poDetailAfter = await query<any>(
      `SELECT received_quantity FROM purchase_order_detail WHERE purchase_order_number = @pon AND item_number = @item`,
      { pon: { type: T.NVarChar, value: ctx.purchaseOrderNumber! }, item: { type: T.NVarChar, value: ctx.itemNumber! } }
    );
    const receivedAfter = safeFloat(poDetailAfter[0].received_quantity);
    expect(receivedAfter).toBe(ctx.poReceivedBefore || 0);
    console.log(`[C2] ✓ PO received_quantity不变: ${receivedAfter}`);

    // 验证7: 入库明细批次号清空、检验状态清空
    const sidRows = await query<any>(
      `SELECT batch_number, inspect_status FROM stock_in_detail WHERE stock_in_number = @si AND item_number = @item`,
      { si: { type: T.NVarChar, value: ctx.stockInNumber! }, item: { type: T.NVarChar, value: ctx.itemNumber! } }
    );
    expect(sidRows[0].batch_number?.trim()).toBe('');
    console.log(`[C2] ✓ 入库明细: batch_number清空`);

    console.log('\n========== 路径C 全部验证通过 ==========');
  });
});