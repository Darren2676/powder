/**
 * 成品装箱管理 E2E 测试
 *
 * 测试策略：API 驱动 + DB 断言 + 最小化 UI 验证
 *   - API: 创建/确认/取消/出库/拆箱等状态变更操作
 *   - DB:  每步操作后验证数据一致性（库存快照对比、状态流转、流水记录）
 *   - UI:  仅验证列表页可正常加载
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { PackingOrderPage } from '../pages/PackingOrderPage';
import {
  getPackingOrder,
  getPackingLabels,
  getPackingBoxes,
  getPackingBoxInventory,
  getFinishedBatchInventory,
  getFinishedGoodsInventory,
  getInventoryTransactions,
  getProductPackingConfig,
  cleanupPackingOrderData,
  cleanupResidualPackingOrders,
  query,
  T,
} from '../helpers/db.helper';
import {
  createPackingOrderAPI,
  confirmPackingOrderAPI,
  cancelPackingOrderAPI,
  unpackPackingOrderAPI,
  unpackBoxesAPI,
  boxOutboundAPI,
  getAvailableBatchesAPI,
  disposeApiContext,
} from '../helpers/api.helper';

const TEST_MARKER = `E2E-PACK-${Date.now()}`;
const SCREENSHOT_DIR = 'reports/screenshots-packing';

// ==================== 辅助函数 ====================

/** 查找有成品批次库存的物料+仓库组合 */
async function findItemWithInventory(): Promise<{ itemNumber: string; itemName: string; warehouseNumber: string; warehouseName: string; specifications: string; basicUnit: string } | null> {
  const rows = await query<any>(
    `SELECT TOP 1 fbi.item_number, fbi.item_name, fbi.warehouse_number, fbi.warehouse_name, fbi.specifications, fbi.basic_unit
     FROM finished_batch_inventory fbi
     WHERE fbi.quantity > 0 AND fbi.status = N'正常' AND fbi.quality_status = N'合格品'
     ORDER BY fbi.inbound_date DESC`
  );
  return rows[0] ? {
    itemNumber: rows[0].item_number,
    itemName: rows[0].item_name,
    warehouseNumber: rows[0].warehouse_number,
    warehouseName: rows[0].warehouse_name,
    specifications: rows[0].specifications || '',
    basicUnit: rows[0].basic_unit || '',
  } : null;
}

/** 批次库存快照转Map */
function batchMap(batches: any[]): Map<string, number> {
  return new Map(batches.map(b => [b.batch_number, parseFloat(b.quantity)]));
}

// ==================== 主流程 ====================

test.describe('成品装箱 - 主流程', () => {
  test.setTimeout(120_000);

  const ctx: {
    packingNumber?: string;
    itemNumber?: string;
    itemName?: string;
    specifications?: string;
    basicUnit?: string;
    warehouseNumber?: string;
    warehouseName?: string;
    boxNumbers?: string[];
    innerPackQty?: number;
    outerPackQty?: number;
    totalQuantity?: number;
  } = {};

  test.beforeAll(async () => {
    const inv = await findItemWithInventory();
    if (inv) {
      ctx.itemNumber = inv.itemNumber;
      ctx.itemName = inv.itemName;
      ctx.specifications = inv.specifications;
      ctx.basicUnit = inv.basicUnit;
      ctx.warehouseNumber = inv.warehouseNumber;
      ctx.warehouseName = inv.warehouseName;
      await cleanupResidualPackingOrders(inv.itemNumber, 'E2E-PACK-');
    }
  });

  test.afterAll(async () => {
    if (ctx.packingNumber) {
      await cleanupPackingOrderData(ctx.packingNumber);
    }
    if (ctx.itemNumber) {
      await cleanupResidualPackingOrders(ctx.itemNumber, 'E2E-PACK-');
    }
    await disposeApiContext();
  });

  test('创建→确认→整单拆箱→重新确认→出库→逐箱拆箱', async ({ page }) => {
    // 预检：是否有成品批次库存
    const inv = await findItemWithInventory();
    if (!inv) {
      test.skip();
      return;
    }
    ctx.itemNumber = inv.itemNumber;
    ctx.itemName = inv.itemName;
    ctx.specifications = inv.specifications;
    ctx.basicUnit = inv.basicUnit;
    ctx.warehouseNumber = inv.warehouseNumber;
    ctx.warehouseName = inv.warehouseName;

    const loginPage = new LoginPage(page);
    const packingPage = new PackingOrderPage(page);

    // ========== Step 1: 登录 ==========
    await test.step('1. 登录系统', async () => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin123');
      await expect(page).not.toHaveURL(/\/login/);
    });

    // ========== Step 2: UI导航验证 ==========
    await test.step('2. 导航到装箱管理页', async () => {
      await packingPage.goto();
      await packingPage.verifyListLoaded();
      await page.screenshot({ path: `${SCREENSHOT_DIR}/01-packing-list.png`, fullPage: true });
    });

    // ========== Step 3: 快照批次库存 BEFORE ==========
    let beforeBatches: any[];
    let beforeSummary: any;
    await test.step('3. 快照批次库存（BEFORE）', async () => {
      beforeBatches = await getFinishedBatchInventory(ctx.itemNumber!, ctx.warehouseNumber!);
      beforeSummary = await getFinishedGoodsInventory(ctx.itemNumber!, ctx.warehouseNumber!);
      console.log('[BEFORE] 批次库存:', beforeBatches.map(b => `${b.batch_number}=${b.quantity}`).join(', '));
      console.log('[BEFORE] 汇总库存:', beforeSummary?.quantity || 0);
    });

    // ========== Step 4: API创建装箱单 ==========
    await test.step('4. 创建装箱单 → DB验证', async () => {
      // 获取产品包装规格
      const config = await getProductPackingConfig(ctx.itemNumber!);
      const innerPackQty = config?.inner_pack_qty || 10;
      const outerPackQty = config?.outer_pack_qty || 5;
      ctx.innerPackQty = innerPackQty;
      ctx.outerPackQty = outerPackQty;

      // 计算装箱数量：取最少批次的可用量，但不超过100
      const availableBatches = await getAvailableBatchesAPI(ctx.itemNumber!, ctx.warehouseNumber!);
      const totalAvailable = availableBatches.reduce((sum: number, b: any) => sum + parseFloat(b.quantity), 0);
      const totalQuantity = Math.min(Math.floor(totalAvailable * 0.5), 100); // 用一半库存，最多100
      ctx.totalQuantity = totalQuantity;

      console.log(`[创建] item=${ctx.itemNumber}, wh=${ctx.warehouseNumber}, qty=${totalQuantity}, inner=${innerPackQty}, outer=${outerPackQty}`);

      const result = await createPackingOrderAPI({
        warehouse_number: ctx.warehouseNumber!,
        warehouse_name: ctx.warehouseName!,
        item_number: ctx.itemNumber!,
        item_name: ctx.itemName!,
        specifications: ctx.specifications || '',
        basic_unit: ctx.basicUnit || '',
        total_quantity: totalQuantity,
        inner_pack_qty: innerPackQty,
        outer_pack_qty: outerPackQty,
        remark: TEST_MARKER,
      });

      ctx.packingNumber = result.packing_number;
      console.log('[创建] 装箱单号:', ctx.packingNumber);

      // DB断言
      const order = await getPackingOrder(ctx.packingNumber!);
      expect(order, '装箱单应存在').toBeTruthy();
      expect(order.status).toBe('草稿');
      expect(parseFloat(order.total_quantity)).toBe(totalQuantity);

      // 验证标签数
      const labels = await getPackingLabels(ctx.packingNumber!);
      const expectedLabels = Math.ceil(totalQuantity / innerPackQty); // 包括尾袋
      expect(labels.length).toBe(expectedLabels);
      console.log(`[DB] 标签数: ${labels.length} (期望: ${expectedLabels})`);

      // 验证箱数
      const boxes = await getPackingBoxes(ctx.packingNumber!);
      const expectedBoxes = Math.ceil(expectedLabels / outerPackQty);
      expect(boxes.length).toBe(expectedBoxes);
      ctx.boxNumbers = boxes.map((b: any) => b.box_number);
      console.log(`[DB] 箱数: ${boxes.length} (期望: ${expectedBoxes}), 箱号: ${ctx.boxNumbers.join(', ')}`);

      // 批次库存应未扣减（草稿状态）
      const afterBatches = await getFinishedBatchInventory(ctx.itemNumber!, ctx.warehouseNumber!);
      const beforeMap = batchMap(beforeBatches);
      const afterMap = batchMap(afterBatches);
      for (const [batch, qty] of beforeMap) {
        expect(afterMap.get(batch)).toBeCloseTo(qty, 1);
      }
    });

    // ========== Step 5: API确认装箱单 ==========
    await test.step('5. 确认装箱单 → DB验证库存扣减', async () => {
      await confirmPackingOrderAPI(ctx.packingNumber!);

      // DB: 状态已确认
      const order = await getPackingOrder(ctx.packingNumber!);
      expect(order.status).toBe('已确认');
      console.log('[确认] status:', order.status);

      // DB: 批次库存已扣减
      const afterBatches = await getFinishedBatchInventory(ctx.itemNumber!, ctx.warehouseNumber!);
      const afterMap = batchMap(afterBatches);
      const beforeMap = batchMap(beforeBatches!);
      let totalDeducted = 0;
      for (const [batch, beforeQty] of beforeMap) {
        const afterQty = afterMap.get(batch) || 0;
        const diff = beforeQty - afterQty;
        if (diff > 0) totalDeducted += diff;
      }
      console.log(`[DB] 批次库存总扣减: ${totalDeducted.toFixed(4)}, 期望: ${ctx.totalQuantity}`);
      expect(totalDeducted).toBeCloseTo(ctx.totalQuantity!, 1);

      // DB: 箱装库存已创建
      const boxInv = await getPackingBoxInventory(ctx.packingNumber!);
      expect(boxInv.length).toBeGreaterThan(0);
      const inStockBoxes = boxInv.filter((b: any) => b.status === '在库');
      expect(inStockBoxes.length).toBe(boxInv.length); // 全部在库
      console.log(`[DB] 箱装库存: ${boxInv.length} 箱 (全部在库)`);

      // 汇总库存不应减少（确认是形态转换：散装→箱装）
      const afterSummary = await getFinishedGoodsInventory(ctx.itemNumber!, ctx.warehouseNumber!);
      const beforeSummaryQty = parseFloat(beforeSummary?.quantity || '0');
      const afterSummaryQty = parseFloat(afterSummary?.quantity || '0');
      console.log(`[DB] 汇总库存: before=${beforeSummaryQty}, after=${afterSummaryQty} (确认是形态转换，总量不变)`);
      expect(afterSummaryQty).toBeCloseTo(beforeSummaryQty, 1);
    });

    // ========== Step 6: API整单拆箱（所有箱均在库，应成功） ==========
    await test.step('6. 整单拆箱 → DB验证库存恢复', async () => {
      await unpackPackingOrderAPI(ctx.packingNumber!);

      // DB: 状态回退到草稿
      const order = await getPackingOrder(ctx.packingNumber!);
      expect(order.status).toBe('草稿');
      console.log('[整单拆箱] status:', order.status);

      // DB: 箱装库存记录应减少（已拆箱的箱删除了库存记录）
      const boxInv = await getPackingBoxInventory(ctx.packingNumber!);
      console.log(`[DB] 箱装库存记录: ${boxInv.length}`);

      // DB: 批次库存完全恢复（整单拆箱恢复了所有已扣减库存，应回到操作前水平）
      const afterBatches = await getFinishedBatchInventory(ctx.itemNumber!, ctx.warehouseNumber!);
      const afterMap = batchMap(afterBatches);
      const beforeMap = batchMap(beforeBatches!);
      // 验证每个批次的库存已恢复到操作前水平
      for (const [batch, beforeQty] of beforeMap) {
        const afterQty = afterMap.get(batch) || 0;
        expect(afterQty, `批次 ${batch} 库存应恢复到原始水平`).toBeCloseTo(beforeQty, 1);
      }
      console.log('[DB] 批次库存已完全恢复到操作前水平');
    });

    // ========== Step 7: 重新确认装箱单 ==========
    await test.step('7. 重新确认装箱单 → DB验证', async () => {
      await confirmPackingOrderAPI(ctx.packingNumber!);

      const order = await getPackingOrder(ctx.packingNumber!);
      expect(order.status).toBe('已确认');
      console.log('[重新确认] status:', order.status);

      // 刷新箱号列表（确认后箱装库存重建）
      const boxInv = await getPackingBoxInventory(ctx.packingNumber!);
      expect(boxInv.length).toBeGreaterThan(0);
      ctx.boxNumbers = boxInv.map((b: any) => b.box_number);
      console.log(`[重新确认] 箱号: ${ctx.boxNumbers.join(', ')}`);
    });

    // ========== Step 8: API箱码出库（第1箱） ==========
    if (ctx.boxNumbers && ctx.boxNumbers.length >= 1) {
      await test.step('8. 箱码出库(第1箱) → DB验证', async () => {
        const outboundBox = ctx.boxNumbers![0];
        console.log(`[出库] 箱号: ${outboundBox}`);

        const beforeSummary = await getFinishedGoodsInventory(ctx.itemNumber!, ctx.warehouseNumber!);
        const beforeSummaryQty = parseFloat(beforeSummary?.quantity || '0');

        await boxOutboundAPI([outboundBox], ctx.warehouseNumber!);

        // DB: 箱状态=已出库
        const boxInv = await getPackingBoxInventory(ctx.packingNumber!);
        const outboundBoxInv = boxInv.find((b: any) => b.box_number === outboundBox);
        expect(outboundBoxInv?.status).toBe('已出库');
        console.log(`[DB] ${outboundBox} status: ${outboundBoxInv?.status}`);

        // DB: 箱表中该箱状态=已出库
        const boxes = await getPackingBoxes(ctx.packingNumber!);
        const outboundBoxRecord = boxes.find((b: any) => b.box_number === outboundBox);
        expect(outboundBoxRecord?.status).toBe('已出库');

        // DB: 汇总库存已扣减
        const afterSummary = await getFinishedGoodsInventory(ctx.itemNumber!, ctx.warehouseNumber!);
        const afterSummaryQty = parseFloat(afterSummary?.quantity || '0');
        const boxQty = parseFloat(outboundBoxInv?.total_quantity || '0');
        expect(beforeSummaryQty - afterSummaryQty).toBeCloseTo(boxQty, 1);
        console.log(`[DB] 汇总库存: ${beforeSummaryQty} → ${afterSummaryQty} (扣减 ${boxQty})`);

        // DB: 流水记录
        const txns = await getInventoryTransactions('扫箱码出库', outboundBox);
        expect(txns.length).toBeGreaterThanOrEqual(1);
        console.log(`[DB] 出库流水: ${txns.length} 条`);
      });
    }

    // ========== Step 9: API逐箱拆箱（第2箱，如果存在） ==========
    if (ctx.boxNumbers && ctx.boxNumbers.length >= 2) {
      await test.step('9. 逐箱拆箱(第2箱) → DB验证', async () => {
        const unpackBox = ctx.boxNumbers![1];
        console.log(`[逐箱拆箱] 箱号: ${unpackBox}`);

        const beforeBatches2 = await getFinishedBatchInventory(ctx.itemNumber!, ctx.warehouseNumber!);
        const beforeMap2 = batchMap(beforeBatches2);

        await unpackBoxesAPI([unpackBox], ctx.warehouseNumber!);

        // DB: 箱状态=已拆箱
        const boxInv = await getPackingBoxInventory(ctx.packingNumber!);
        const unpackBoxInv = boxInv.find((b: any) => b.box_number === unpackBox);
        expect(unpackBoxInv?.status).toBe('已拆箱');
        console.log(`[DB] ${unpackBox} status: ${unpackBoxInv?.status}`);

        // DB: 箱表中该箱状态=已拆箱
        const boxes = await getPackingBoxes(ctx.packingNumber!);
        const unpackBoxRecord = boxes.find((b: any) => b.box_number === unpackBox);
        expect(unpackBoxRecord?.status).toBe('已拆箱');

        // DB: 批次库存恢复
        const afterBatches2 = await getFinishedBatchInventory(ctx.itemNumber!, ctx.warehouseNumber!);
        const afterMap2 = batchMap(afterBatches2);
        let totalRestored = 0;
        for (const [batch, beforeQty] of beforeMap2) {
          const afterQty = afterMap2.get(batch) || 0;
          const diff = afterQty - beforeQty;
          if (diff > 0) totalRestored += diff;
        }
        const boxQty = parseFloat(unpackBoxInv?.total_quantity || '0');
        console.log(`[DB] 批次库存恢复: ${totalRestored.toFixed(4)} (箱量: ${boxQty})`);
        expect(totalRestored).toBeCloseTo(boxQty, 1);

        // DB: 流水记录
        const txns = await getInventoryTransactions('逐箱拆箱', unpackBox);
        expect(txns.length).toBeGreaterThanOrEqual(1);
        console.log(`[DB] 拆箱流水: ${txns.length} 条`);
      });
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/09-test-complete.png`, fullPage: true });
  });
});

// ==================== 取消场景 ====================

test.describe('成品装箱 - 取消场景', () => {
  test.setTimeout(60_000);

  test.afterAll(async () => {
    await disposeApiContext();
  });

  test('取消草稿装箱单', async () => {
    const inv = await findItemWithInventory();
    if (!inv) { test.skip(); return; }

    const config = await getProductPackingConfig(inv.itemNumber);
    const innerPackQty = config?.inner_pack_qty || 10;
    const outerPackQty = config?.outer_pack_qty || 5;
    const availableBatches = await getAvailableBatchesAPI(inv.itemNumber, inv.warehouseNumber);
    const totalAvailable = availableBatches.reduce((sum: number, b: any) => sum + parseFloat(b.quantity), 0);
    const totalQuantity = Math.min(Math.floor(totalAvailable * 0.3), 50);

    // 快照库存
    const beforeBatches = await getFinishedBatchInventory(inv.itemNumber, inv.warehouseNumber);

    // 创建 + 取消
    const result = await createPackingOrderAPI({
      warehouse_number: inv.warehouseNumber,
      warehouse_name: inv.warehouseName,
      item_number: inv.itemNumber,
      item_name: inv.itemName,
      specifications: inv.specifications || '',
      basic_unit: inv.basicUnit || '',
      total_quantity: totalQuantity,
      inner_pack_qty: innerPackQty,
      outer_pack_qty: outerPackQty,
      remark: `${TEST_MARKER}-cancel-draft`,
    });

    const packingNumber = result.packing_number;
    let order = await getPackingOrder(packingNumber);
    expect(order.status).toBe('草稿');

    await cancelPackingOrderAPI(packingNumber);

    // DB验证
    order = await getPackingOrder(packingNumber);
    expect(order.status).toBe('已取消');
    console.log('[取消草稿] status:', order.status);

    // 批次库存无变化
    const afterBatches = await getFinishedBatchInventory(inv.itemNumber, inv.warehouseNumber);
    const beforeMap = batchMap(beforeBatches);
    const afterMap = batchMap(afterBatches);
    for (const [batch, qty] of beforeMap) {
      expect(afterMap.get(batch)).toBeCloseTo(qty, 1);
    }
    console.log('[取消草稿] 批次库存无变化 ✓');

    // 清理
    await cleanupPackingOrderData(packingNumber);
  });

  test('取消已确认装箱单', async () => {
    const inv = await findItemWithInventory();
    if (!inv) { test.skip(); return; }

    const config = await getProductPackingConfig(inv.itemNumber);
    const innerPackQty = config?.inner_pack_qty || 10;
    const outerPackQty = config?.outer_pack_qty || 5;
    const availableBatches = await getAvailableBatchesAPI(inv.itemNumber, inv.warehouseNumber);
    const totalAvailable = availableBatches.reduce((sum: number, b: any) => sum + parseFloat(b.quantity), 0);
    const totalQuantity = Math.min(Math.floor(totalAvailable * 0.3), 50);

    // 创建 + 确认
    const result = await createPackingOrderAPI({
      warehouse_number: inv.warehouseNumber,
      warehouse_name: inv.warehouseName,
      item_number: inv.itemNumber,
      item_name: inv.itemName,
      specifications: inv.specifications || '',
      basic_unit: inv.basicUnit || '',
      total_quantity: totalQuantity,
      inner_pack_qty: innerPackQty,
      outer_pack_qty: outerPackQty,
      remark: `${TEST_MARKER}-cancel-confirmed`,
    });

    const packingNumber = result.packing_number;
    await confirmPackingOrderAPI(packingNumber);

    // 快照已扣减后的库存
    const afterConfirmBatches = await getFinishedBatchInventory(inv.itemNumber, inv.warehouseNumber);
    const boxInv = await getPackingBoxInventory(packingNumber);
    expect(boxInv.length).toBeGreaterThan(0);

    // 取消
    await cancelPackingOrderAPI(packingNumber);

    // DB验证
    const order = await getPackingOrder(packingNumber);
    expect(order.status).toBe('已取消');
    console.log('[取消已确认] status:', order.status);

    // 批次库存完全恢复
    const afterCancelBatches = await getFinishedBatchInventory(inv.itemNumber, inv.warehouseNumber);
    const afterConfirmMap = batchMap(afterConfirmBatches);
    const afterCancelMap = batchMap(afterCancelBatches);
    let totalRestored = 0;
    for (const [batch, qty] of afterConfirmMap) {
      const diff = (afterCancelMap.get(batch) || 0) - qty;
      if (diff > 0) totalRestored += diff;
    }
    console.log(`[取消已确认] 批次库存恢复: ${totalRestored.toFixed(4)} (期望: ${totalQuantity})`);
    expect(totalRestored).toBeCloseTo(totalQuantity, 1);

    // 箱装库存已删除
    const boxInvAfter = await getPackingBoxInventory(packingNumber);
    expect(boxInvAfter.length).toBe(0);
    console.log('[取消已确认] 箱装库存已删除 ✓');

    // 清理
    await cleanupPackingOrderData(packingNumber);
  });
});

// ==================== 边界场景 ====================

test.describe('成品装箱 - 边界场景', () => {
  test.setTimeout(60_000);

  test.afterAll(async () => {
    await disposeApiContext();
  });

  test('取消失败-有箱已出库', async () => {
    const inv = await findItemWithInventory();
    if (!inv) { test.skip(); return; }

    const config = await getProductPackingConfig(inv.itemNumber);
    const innerPackQty = config?.inner_pack_qty || 10;
    const outerPackQty = config?.outer_pack_qty || 5;
    const availableBatches = await getAvailableBatchesAPI(inv.itemNumber, inv.warehouseNumber);
    const totalAvailable = availableBatches.reduce((sum: number, b: any) => sum + parseFloat(b.quantity), 0);
    const totalQuantity = Math.min(Math.floor(totalAvailable * 0.3), 50);

    // 创建 + 确认 + 出库所有箱
    const result = await createPackingOrderAPI({
      warehouse_number: inv.warehouseNumber,
      warehouse_name: inv.warehouseName,
      item_number: inv.itemNumber,
      item_name: inv.itemName,
      specifications: inv.specifications || '',
      basic_unit: inv.basicUnit || '',
      total_quantity: totalQuantity,
      inner_pack_qty: innerPackQty,
      outer_pack_qty: outerPackQty,
      remark: `${TEST_MARKER}-boundary-cancel`,
    });

    const packingNumber = result.packing_number;
    await confirmPackingOrderAPI(packingNumber);

    const boxes = await getPackingBoxes(packingNumber);
    const allBoxNumbers = boxes.map((b: any) => b.box_number);
    if (allBoxNumbers.length > 0) {
      await boxOutboundAPI(allBoxNumbers, inv.warehouseNumber);
    }

    // 取消应失败
    try {
      await cancelPackingOrderAPI(packingNumber);
      // 如果没抛错，说明业务逻辑可能允许（不应该）
      console.warn('[边界] 取消已出库箱的装箱单未报错，需检查业务逻辑');
    } catch (e: any) {
      expect(e.message).toContain('400');
      console.log('[边界] 取消失败(预期):', e.message.substring(0, 100));
    }

    // DB: 状态仍为已确认
    const order = await getPackingOrder(packingNumber);
    expect(order.status).toBe('已确认');

    // 清理
    await cleanupPackingOrderData(packingNumber);
  });

  test('整单拆箱失败-有箱已出库', async () => {
    const inv = await findItemWithInventory();
    if (!inv) { test.skip(); return; }

    const config = await getProductPackingConfig(inv.itemNumber);
    const innerPackQty = config?.inner_pack_qty || 10;
    const outerPackQty = config?.outer_pack_qty || 5;
    const availableBatches = await getAvailableBatchesAPI(inv.itemNumber, inv.warehouseNumber);
    const totalAvailable = availableBatches.reduce((sum: number, b: any) => sum + parseFloat(b.quantity), 0);
    const totalQuantity = Math.min(Math.floor(totalAvailable * 0.3), 50);

    // 创建 + 确认 + 出库所有箱
    const result = await createPackingOrderAPI({
      warehouse_number: inv.warehouseNumber,
      warehouse_name: inv.warehouseName,
      item_number: inv.itemNumber,
      item_name: inv.itemName,
      specifications: inv.specifications || '',
      basic_unit: inv.basicUnit || '',
      total_quantity: totalQuantity,
      inner_pack_qty: innerPackQty,
      outer_pack_qty: outerPackQty,
      remark: `${TEST_MARKER}-boundary-unpack`,
    });

    const packingNumber = result.packing_number;
    await confirmPackingOrderAPI(packingNumber);

    const boxes = await getPackingBoxes(packingNumber);
    const allBoxNumbers = boxes.map((b: any) => b.box_number);
    if (allBoxNumbers.length > 0) {
      await boxOutboundAPI(allBoxNumbers, inv.warehouseNumber);
    }

    // 整单拆箱应失败
    try {
      await unpackPackingOrderAPI(packingNumber);
      console.warn('[边界] 整单拆箱已出库箱未报错，需检查业务逻辑');
    } catch (e: any) {
      expect(e.message).toContain('400');
      console.log('[边界] 整单拆箱失败(预期):', e.message.substring(0, 100));
    }

    // DB: 状态仍为已确认
    const order = await getPackingOrder(packingNumber);
    expect(order.status).toBe('已确认');

    // 清理
    await cleanupPackingOrderData(packingNumber);
  });

  test('逐箱拆箱失败-非在库箱', async () => {
    const inv = await findItemWithInventory();
    if (!inv) { test.skip(); return; }

    const config = await getProductPackingConfig(inv.itemNumber);
    const innerPackQty = config?.inner_pack_qty || 10;
    const outerPackQty = config?.outer_pack_qty || 5;
    const availableBatches = await getAvailableBatchesAPI(inv.itemNumber, inv.warehouseNumber);
    const totalAvailable = availableBatches.reduce((sum: number, b: any) => sum + parseFloat(b.quantity), 0);
    const totalQuantity = Math.min(Math.floor(totalAvailable * 0.3), 50);

    // 创建 + 确认 + 出库第1箱
    const result = await createPackingOrderAPI({
      warehouse_number: inv.warehouseNumber,
      warehouse_name: inv.warehouseName,
      item_number: inv.itemNumber,
      item_name: inv.itemName,
      specifications: inv.specifications || '',
      basic_unit: inv.basicUnit || '',
      total_quantity: totalQuantity,
      inner_pack_qty: innerPackQty,
      outer_pack_qty: outerPackQty,
      remark: `${TEST_MARKER}-boundary-box-unpack`,
    });

    const packingNumber = result.packing_number;
    await confirmPackingOrderAPI(packingNumber);

    const boxes = await getPackingBoxes(packingNumber);
    if (boxes.length < 1) { test.skip(); return; }

    const outboundBox = boxes[0].box_number;
    await boxOutboundAPI([outboundBox], inv.warehouseNumber);

    // 逐箱拆箱已出库箱应失败
    try {
      await unpackBoxesAPI([outboundBox], inv.warehouseNumber);
      console.warn('[边界] 逐箱拆箱已出库箱未报错，需检查业务逻辑');
    } catch (e: any) {
      expect(e.message).toContain('400');
      console.log('[边界] 逐箱拆箱失败(预期):', e.message.substring(0, 100));
    }

    // DB: 该箱仍为已出库
    const boxInv = await getPackingBoxInventory(packingNumber);
    const targetBox = boxInv.find((b: any) => b.box_number === outboundBox);
    expect(targetBox?.status).toBe('已出库');

    // 清理
    await cleanupPackingOrderData(packingNumber);
  });
});
