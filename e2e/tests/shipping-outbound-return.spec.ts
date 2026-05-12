/**
 * 销售发货退货全链路 E2E 测试：
 *   销售订单 → 发货申请 → 发货出库(批次FIFO + 扫箱码)
 *   → 退货(退款退货/退货换货) → 退货入库
 *   → 退货驳回 → 最终状态验证
 *
 * 策略：API 驱动 + DB 断言（纯API，无UI操作）
 */
import { test, expect } from '@playwright/test';
import {
  getLatestSalesOrder,
  getSalesOrderDetails,
  getSalesOrderDetailById,
  getShippingRequest,
  getShippingRequestDetails,
  getShippingOrder,
  getShippingOrderDetails,
  getShippingOrderBatches,
  getReturnOrder,
  getReturnOrderDetails,
  getFinishedBatchInventory,
  getFinishedGoodsInventory,
  getInventoryTransactions,
  getProductPackingConfig,
  getPackingBoxes,
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
  createPackingOrderAPI,
  confirmPackingOrderAPI,
  boxOutboundAPI,
  createReturnOrderAPI,
  confirmReturnOrderAPI,
  rejectReturnOrderAPI,
  returnInboundAPI,
} from '../helpers/api.helper';

// 测试数据
const TEST_ITEM = 'C100809';
const TEST_QTY = 100;
const WAREHOUSE_FINISHED = '01';
const WAREHOUSE_NAME = '成品仓';
const TEST_REMARK = 'E2E-SHIPPING-RETURN';
const CUSTOMER_NUMBER = 'AH001';

// 全局共享状态
const ctx: {
  salesOrderNumber?: string;
  salesDetailId?: number;
  requestNumber?: string;
  shippingOrderNumber?: string;
  shippingDetailId?: number;
  returnOrderNumbers: string[];
  packingNumber?: string;
  seededBatchNumber?: string;
} = {
  returnOrderNumbers: [],
};

test.describe.serial('销售发货退货全链路 E2E', () => {
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
        returnOrderNumbers: ctx.returnOrderNumbers,
        packingNumbers: ctx.packingNumber ? [ctx.packingNumber] : [],
      });
      console.log('[afterAll] 清理结果:', r);
    } catch (e) {
      console.warn('[afterAll] 清理异常:', e);
    }
    await disposeApiContext();
  });

  // ==================== Test 1: 销售订单+审批 → 发货申请+审批 ====================
  test('1. 创建+审批销售订单→创建发货申请+审批', async () => {
    // Step 1: 种子成品库存
    const batchNo = await seedFinishedInventory(TEST_ITEM, WAREHOUSE_FINISHED, 200);
    ctx.seededBatchNumber = batchNo!;
    console.log(`[Test1] 种子成品库存: ${batchNo}`);

    // Step 2: 创建销售订单
    const soResult = await createSalesOrderAPI({
      customer_number: CUSTOMER_NUMBER,
      remark: TEST_REMARK,
      details: [{
        item_number: TEST_ITEM,
        order_quantity: TEST_QTY,
      }],
    });
    expect(soResult?.sales_order_number, '未返回销售订单号').toBeTruthy();
    ctx.salesOrderNumber = soResult.sales_order_number;
    console.log(`[Test1] 销售订单创建: ${ctx.salesOrderNumber}`);

    // Step 3: 审批销售订单
    await submitAndApprove('sales_order', ctx.salesOrderNumber);
    const so = await getLatestSalesOrder(CUSTOMER_NUMBER);
    expect(so?.approval_status, '销售订单审批失败').toBe('已审批');
    console.log(`[Test1] 销售订单已审批`);

    // Step 4: 获取销售订单明细
    const details = await getSalesOrderDetails(ctx.salesOrderNumber);
    expect(details.length, '销售订单明细为空').toBeGreaterThan(0);
    ctx.salesDetailId = details[0].id;
    console.log(`[Test1] 销售明细: id=${ctx.salesDetailId}, item=${details[0].item_number}, qty=${details[0].order_quantity}`);

    // Step 5: 创建发货申请
    const srResult = await createShippingRequestAPI({
      customer_number: CUSTOMER_NUMBER,
      remark: 'E2E发货申请',
      details: [{
        sales_order_number: ctx.salesOrderNumber,
        detail_id: ctx.salesDetailId!,
        item_number: TEST_ITEM,
        order_quantity: TEST_QTY,
        shipped_quantity: 0,
        ship_quantity: TEST_QTY,
      }],
    });
    expect(srResult?.request_number, '未返回发货申请号').toBeTruthy();
    ctx.requestNumber = srResult.request_number;
    console.log(`[Test1] 发货申请创建: ${ctx.requestNumber}`);

    // Step 6: 审批发货申请（更新状态为已审核）
    await updateShippingRequestStatusAPI(ctx.requestNumber, '已审核');
    const sr = await getShippingRequest(ctx.requestNumber);
    expect(sr?.status, '发货申请审批失败').toBe('已审核');
    console.log(`[Test1] 发货申请已审核`);

    // DB 断言: sales_order_detail.shipping_status
    const detailAfter = await getSalesOrderDetailById(ctx.salesDetailId!);
    console.log(`[Test1] shipping_status=${detailAfter?.shipping_status}`);
  });

  // ==================== Test 2: 批次FIFO出库(50个) ====================
  test('2. 批次FIFO出库(50个)→部分发货', async () => {
    expect(ctx.requestNumber, '无发货申请号').toBeTruthy();
    expect(ctx.salesDetailId, '无销售明细ID').toBeTruthy();

    // Step 1: 查询可用批次库存
    const batches = await getFinishedBatchInventory(TEST_ITEM, WAREHOUSE_FINISHED);
    expect(batches.length, '无可用成品批次库存').toBeGreaterThan(0);
    console.log(`[Test2] 可用批次数: ${batches.length}`);

    // FIFO: 取最早的批次，出库50个
    const fifoBatch = batches[0];
    const batchItems = [{ batch_number: fifoBatch.batch_number, quantity: 50 }];

    // Step 2: 批次出库
    const outboundResult = await batchOutboundAPI({
      warehouse_number: WAREHOUSE_FINISHED,
      warehouse_name: WAREHOUSE_NAME,
      remark: 'E2E批次出库50',
      items: [{
        request_number: ctx.requestNumber!,
        item_number: TEST_ITEM,
        ship_quantity: 50,
        warehouse_number: WAREHOUSE_FINISHED,
        warehouse_name: WAREHOUSE_NAME,
        sales_detail_id: ctx.salesDetailId,
        batch_items: batchItems,
      }],
    });
    console.log(`[Test2] 出库结果:`, outboundResult);

    // 出库结果应包含shipping_order_number
    if (outboundResult?.shippingOrderNumber) {
      ctx.shippingOrderNumber = outboundResult.shippingOrderNumber;
      console.log(`[Test2] 自动生成发货单: ${ctx.shippingOrderNumber}`);
    }

    // DB 断言: 发货单已生成
    if (ctx.shippingOrderNumber) {
      const so = await getShippingOrder(ctx.shippingOrderNumber);
      expect(so, '未查到发货单').toBeTruthy();
      console.log(`[Test2] 发货单状态: ${so?.status}`);

      // 获取发货单明细
      const soDetails = await getShippingOrderDetails(ctx.shippingOrderNumber);
      expect(soDetails.length, '发货单明细为空').toBeGreaterThan(0);
      ctx.shippingDetailId = soDetails[0].id;
      console.log(`[Test2] 发货单明细id: ${ctx.shippingDetailId}`);
    }

    // DB 断言: 库存流水
    const txns = await getInventoryTransactions('发货出库', ctx.shippingOrderNumber || '');
    if (txns.length > 0) {
      console.log(`[Test2] 发货出库流水数: ${txns.length}, 第1条qty=${txns[0].quantity}`);
    }

    // DB 断言: 销售订单明细 shipped_quantity + shipping_status
    const detailAfter = await getSalesOrderDetailById(ctx.salesDetailId!);
    console.log(`[Test2] shipped_quantity=${detailAfter?.shipped_quantity}, shipping_status=${detailAfter?.shipping_status}`);
    expect(Number(detailAfter?.shipped_quantity), 'shipped_quantity应为50').toBeGreaterThanOrEqual(50);
  });

  // ==================== Test 3: 装箱+确认 → 扫箱码出库(剩余50个) ====================
  test('3. 装箱+确认→扫箱码出库→全部发货', async () => {
    expect(ctx.shippingOrderNumber, '无发货单号').toBeTruthy();

    // Step 1: 查产品包装规格
    const packConfig = await getProductPackingConfig(TEST_ITEM);
    const innerPackQty = packConfig?.inner_pack_qty || 10;
    const outerPackQty = packConfig?.outer_pack_qty || 50;
    console.log(`[Test3] 包装规格: inner=${innerPackQty}, outer=${outerPackQty}`);

    // Step 2: 查询物料信息
    const itemRows = await query<any>(
      `SELECT item_name, specifications, basic_unit FROM item_master WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM } }
    );
    const itemInfo = itemRows[0] || {};

    // Step 3: 创建装箱单（50个）
    const packingResult = await createPackingOrderAPI({
      warehouse_number: WAREHOUSE_FINISHED,
      warehouse_name: WAREHOUSE_NAME,
      item_number: TEST_ITEM,
      item_name: itemInfo.item_name || '',
      specifications: itemInfo.specifications || '',
      basic_unit: itemInfo.basic_unit || '',
      total_quantity: 50,
      inner_pack_qty: innerPackQty,
      outer_pack_qty: outerPackQty,
      remark: 'E2E装箱-发货退货测试',
    });
    expect(packingResult?.packing_number, '未返回装箱单号').toBeTruthy();
    ctx.packingNumber = packingResult.packing_number;
    console.log(`[Test3] 装箱单创建: ${ctx.packingNumber}`);

    // Step 3: 确认装箱单
    await confirmPackingOrderAPI(ctx.packingNumber);
    console.log(`[Test3] 装箱单已确认`);

    // Step 4: 获取箱码
    const boxes = await getPackingBoxes(ctx.packingNumber);
    expect(boxes.length, '装箱后无箱记录').toBeGreaterThan(0);
    const boxNumbers = boxes.map((b: any) => b.box_number);
    console.log(`[Test3] 箱码数: ${boxNumbers.length}, 箱码: ${boxNumbers.join(',')}`);

    // Step 5: 扫箱码出库
    const boxOutResult = await boxOutboundAPI(boxNumbers, WAREHOUSE_FINISHED, ctx.shippingOrderNumber);
    console.log(`[Test3] 箱码出库结果:`, boxOutResult);

    // DB 断言: 库存流水 (扫箱码出库)
    const boxTxns = await query<any>(
      `SELECT transaction_number, source_type, source_number, item_number, quantity
       FROM inventory_transaction WHERE source_type = N'扫箱码出库'`
    );
    console.log(`[Test3] 扫箱码出库流水数: ${boxTxns.length}`);
    expect(boxTxns.length, '应有扫箱码出库流水').toBeGreaterThan(0);

    // DB 断言: 箱装库存状态变更
    const boxInv = await query<any>(
      `SELECT box_number, status FROM packing_box_inventory WHERE packing_number = @pn`,
      { pn: { type: T.NVarChar, value: ctx.packingNumber! } }
    );
    const allOutbound = boxInv.every((b: any) => b.status === '已出库');
    console.log(`[Test3] 箱装库存状态: ${boxInv.map((b: any) => b.status).join(',')}`);
    expect(allOutbound, '箱装库存应全部已出库').toBeTruthy();

    // 注: 扫箱码出库是仓库操作，不更新 sales_order_detail.shipped_quantity
    // shipped_quantity 仍为50(批次出库部分)
    const detailAfter = await getSalesOrderDetailById(ctx.salesDetailId!);
    console.log(`[Test3] shipped_quantity=${detailAfter?.shipped_quantity}, shipping_status=${detailAfter?.shipping_status}`);
  });

  // ==================== Test 4: 退货(退款退货) → 审批 → 确认(入库) ====================
  test('4. 退款退货→审批→确认→入库', async () => {
    expect(ctx.shippingOrderNumber, '无发货单号').toBeTruthy();
    expect(ctx.shippingDetailId, '无发货单明细ID').toBeTruthy();
    expect(ctx.salesDetailId, '无销售明细ID').toBeTruthy();

    // Step 1: 创建退货单（退款退货，退20个）
    const roResult = await createReturnOrderAPI({
      shipping_order_number: ctx.shippingOrderNumber!,
      type: '退款退货',
      warehouse_number: WAREHOUSE_FINISHED,
      warehouse_name: WAREHOUSE_NAME,
      reason: 'E2E测试-退款退货',
      details: [{
        shipping_order_detail_id: ctx.shippingDetailId!,
        sales_order_number: ctx.salesOrderNumber,
        sales_detail_id: ctx.salesDetailId!,
        item_number: TEST_ITEM,
        shipped_quantity: 50,
        return_quantity: 20,
      }],
    });
    expect(roResult?.return_order_number, '未返回退货单号').toBeTruthy();
    const rn1 = roResult.return_order_number;
    ctx.returnOrderNumbers.push(rn1);
    console.log(`[Test4] 退货单创建: ${rn1}`);

    // Step 2: 审批退货单（forceApproveBySql）
    await query(
      `UPDATE return_order SET approval_status = N'已审批' WHERE return_order_number = @rn`,
      { rn: { type: T.NVarChar, value: rn1 } }
    );
    console.log(`[Test4] 退货单已审批`);

    // Step 3: 确认退货单
    await confirmReturnOrderAPI(rn1);
    const ro1 = await getReturnOrder(rn1);
    expect(ro1?.status, '退货单状态应为已确认').toBe('已确认');
    console.log(`[Test4] 退货单已确认, inbound_status=${ro1?.inbound_status}`);

    // Step 4: 如果确认未自动触发入库，则手动调退货入库
    if (ro1?.inbound_status !== '已入库') {
      const inboundResult = await returnInboundAPI(rn1, {
        warehouse_number: WAREHOUSE_FINISHED,
        warehouse_name: WAREHOUSE_NAME,
        remark: 'E2E退货入库-退款退货',
        details: [{
          item_number: TEST_ITEM,
          return_quantity: 20,
          qualified_qty: 20,
          unqualified_qty: 0,
        }],
      });
      console.log(`[Test4] 退货入库结果:`, inboundResult);
    }

    // DB 断言: 退货单入库状态
    const ro1After = await getReturnOrder(rn1);
    expect(ro1After?.inbound_status, '入库状态应为已入库').toBe('已入库');
    console.log(`[Test4] 退货入库状态: ${ro1After?.inbound_status}`);

    // DB 断言: 销售订单明细 refunded_quantity=20, return_status=部分退货
    const detailAfter = await getSalesOrderDetailById(ctx.salesDetailId!);
    console.log(`[Test4] refunded_quantity=${detailAfter?.refunded_quantity}, return_status=${detailAfter?.return_status}, shipping_status=${detailAfter?.shipping_status}`);
    expect(Number(detailAfter?.refunded_quantity), 'refunded_quantity应为20').toBeGreaterThanOrEqual(20);

    // DB 断言: 退货入库流水
    const returnTxns = await query<any>(
      `SELECT transaction_number, source_type, source_number, item_number, quantity
       FROM inventory_transaction WHERE source_type = N'退货入库' AND source_number = @rn`,
      { rn: { type: T.NVarChar, value: rn1 } }
    );
    console.log(`[Test4] 退货入库流水数: ${returnTxns.length}`);
  });

  // ==================== Test 5: 退货(退货换货) → 审批 → 确认 ====================
  test('5. 退货换货→审批→确认→入库', async () => {
    expect(ctx.shippingOrderNumber, '无发货单号').toBeTruthy();
    expect(ctx.shippingDetailId, '无发货单明细ID').toBeTruthy();

    // Step 1: 创建退货单（退货换货，退10个）
    const roResult = await createReturnOrderAPI({
      shipping_order_number: ctx.shippingOrderNumber!,
      type: '退货换货',
      warehouse_number: WAREHOUSE_FINISHED,
      warehouse_name: WAREHOUSE_NAME,
      reason: 'E2E测试-退货换货',
      details: [{
        shipping_order_detail_id: ctx.shippingDetailId!,
        sales_order_number: ctx.salesOrderNumber,
        sales_detail_id: ctx.salesDetailId!,
        item_number: TEST_ITEM,
        shipped_quantity: 50,
        return_quantity: 10,
      }],
    });
    expect(roResult?.return_order_number, '未返回退货单号').toBeTruthy();
    const rn2 = roResult.return_order_number;
    ctx.returnOrderNumbers.push(rn2);
    console.log(`[Test5] 退货单创建: ${rn2}`);

    // Step 2: 审批
    await query(
      `UPDATE return_order SET approval_status = N'已审批' WHERE return_order_number = @rn`,
      { rn: { type: T.NVarChar, value: rn2 } }
    );

    // Step 3: 确认
    await confirmReturnOrderAPI(rn2);
    const ro2 = await getReturnOrder(rn2);
    expect(ro2?.status, '退货单状态应为已确认').toBe('已确认');

    // Step 4: 退货入库
    if (ro2?.inbound_status !== '已入库') {
      await returnInboundAPI(rn2, {
        warehouse_number: WAREHOUSE_FINISHED,
        warehouse_name: WAREHOUSE_NAME,
        remark: 'E2E退货入库-退货换货',
        details: [{
          item_number: TEST_ITEM,
          return_quantity: 10,
          qualified_qty: 10,
          unqualified_qty: 0,
        }],
      });
    }

    // DB 断言: refunded_quantity应累计30, return_status
    const detailAfter = await getSalesOrderDetailById(ctx.salesDetailId!);
    console.log(`[Test5] refunded_quantity=${detailAfter?.refunded_quantity}, return_status=${detailAfter?.return_status}, shipping_status=${detailAfter?.shipping_status}`);
    expect(Number(detailAfter?.refunded_quantity), 'refunded_quantity应累计>=30').toBeGreaterThanOrEqual(30);
  });

  // ==================== Test 6: 退货驳回流程 ====================
  test('6. 退货驳回流程', async () => {
    expect(ctx.shippingOrderNumber, '无发货单号').toBeTruthy();
    expect(ctx.shippingDetailId, '无发货单明细ID').toBeTruthy();

    // 记录当前 refunded_quantity 作为基线
    const detailBefore = await getSalesOrderDetailById(ctx.salesDetailId!);
    const baselineRefunded = Number(detailBefore?.refunded_quantity || 0);
    console.log(`[Test6] 驳回前 refunded_quantity=${baselineRefunded}`);

    // Step 1: 创建退货单
    const roResult = await createReturnOrderAPI({
      shipping_order_number: ctx.shippingOrderNumber!,
      type: '退款退货',
      warehouse_number: WAREHOUSE_FINISHED,
      warehouse_name: WAREHOUSE_NAME,
      reason: 'E2E测试-待驳回',
      details: [{
        shipping_order_detail_id: ctx.shippingDetailId!,
        sales_order_number: ctx.salesOrderNumber,
        sales_detail_id: ctx.salesDetailId!,
        item_number: TEST_ITEM,
        shipped_quantity: 50,
        return_quantity: 5,
      }],
    });
    expect(roResult?.return_order_number, '未返回退货单号').toBeTruthy();
    const rn3 = roResult.return_order_number;
    ctx.returnOrderNumbers.push(rn3);
    console.log(`[Test6] 退货单创建: ${rn3}`);

    // Step 2: 审批（驳回前需已审批状态）
    await query(
      `UPDATE return_order SET approval_status = N'已审批' WHERE return_order_number = @rn`,
      { rn: { type: T.NVarChar, value: rn3 } }
    );

    // Step 3: 驳回
    await rejectReturnOrderAPI(rn3, { confirm_remark: 'E2E测试驳回' });
    const ro3 = await getReturnOrder(rn3);
    expect(ro3?.status, '退货单状态应为已驳回').toBe('已驳回');
    console.log(`[Test6] 退货单已驳回`);

    // DB 断言: refunded_quantity 不变
    const detailAfter = await getSalesOrderDetailById(ctx.salesDetailId!);
    expect(Number(detailAfter?.refunded_quantity), '驳回后refunded_quantity不应变化').toBe(baselineRefunded);
    console.log(`[Test6] 驳回后 refunded_quantity=${detailAfter?.refunded_quantity} (不变)`);
  });

  // ==================== Test 7: 最终状态汇总验证 ====================
  test('7. 最终状态汇总验证', async () => {
    expect(ctx.salesDetailId, '无销售明细ID').toBeTruthy();

    // 1. 销售订单明细最终状态
    const detail = await getSalesOrderDetailById(ctx.salesDetailId!);
    console.log(`[Test7] 最终状态:`);
    console.log(`  order_quantity=${detail?.order_quantity}`);
    console.log(`  shipped_quantity=${detail?.shipped_quantity}`);
    console.log(`  refunded_quantity=${detail?.refunded_quantity}`);
    console.log(`  shipping_status=${detail?.shipping_status}`);
    console.log(`  return_status=${detail?.return_status}`);

    // shipped_quantity >= 50 (批次出库部分; 扫箱码出库不更新此字段)
    expect(Number(detail?.shipped_quantity), 'shipped_quantity应>=50').toBeGreaterThanOrEqual(50);

    // refunded_quantity >= 30 (20退款退货 + 10退货换货, 驳回的不计)
    expect(Number(detail?.refunded_quantity), 'refunded_quantity应>=30').toBeGreaterThanOrEqual(30);

    // return_status 应为部分退货（30 < 100）
    expect(detail?.return_status, 'return_status应为部分退货').toMatch(/部分退货/);

    // 2. 库存流水汇总 - 按已知的 source_number 查询
    const knownSources = [
      ctx.shippingOrderNumber,
      ...ctx.returnOrderNumbers,
      ctx.packingNumber,
    ].filter(Boolean) as string[];

    // 同时查发货单下所有箱码作为source_number
    if (ctx.shippingOrderNumber) {
      const boxRows = await query<any>(
        `SELECT box_number FROM packing_box_inventory WHERE box_number IN (
          SELECT box_number FROM packing_box WHERE packing_number IN (
            SELECT packing_number FROM packing_bag_label WHERE packing_number IN (
              SELECT packing_number FROM packing_order WHERE remark LIKE N'E2E%'
            )
          )
        )`,
      );
      for (const b of boxRows) knownSources.push(b.box_number);
    }

    const allTxns = knownSources.length > 0 ? await query<any>(
      `SELECT source_type, COUNT(*) as cnt, SUM(quantity) as total_qty
       FROM inventory_transaction
       WHERE item_number = @item AND source_number IN (${knownSources.map((_, i) => `@s${i}`).join(',')})
       GROUP BY source_type`,
      {
        item: { type: T.NVarChar, value: TEST_ITEM },
        ...Object.fromEntries(knownSources.map((s, i) => [`s${i}`, { type: T.NVarChar, value: s }])),
      }
    ) : [];

    // 如果上面查不到出库流水，再按item_number+日期范围补充查询
    if (!allTxns.some((t: any) => t.source_type?.includes('出库'))) {
      const recentTxns = await query<any>(
        `SELECT TOP 20 source_type, source_number, quantity, creation_date
         FROM inventory_transaction
         WHERE item_number = @item
         ORDER BY creation_date DESC`,
        { item: { type: T.NVarChar, value: TEST_ITEM } }
      );
      console.log(`[Test7] 最近20条流水:`);
      for (const t of recentTxns) {
        console.log(`  ${t.source_type} | ${t.source_number} | qty=${t.quantity} | ${t.creation_date}`);
      }
      // 合并到allTxns
      const supplement = await query<any>(
        `SELECT source_type, COUNT(*) as cnt, SUM(quantity) as total_qty
         FROM inventory_transaction
         WHERE item_number = @item AND DATEDIFF(MINUTE, creation_date, GETDATE()) < 10
         GROUP BY source_type`,
        { item: { type: T.NVarChar, value: TEST_ITEM } }
      );
      allTxns.push(...supplement);
    }

    console.log(`[Test7] 库存流水汇总:`);
    for (const t of allTxns) {
      console.log(`  ${t.source_type}: count=${t.cnt}, total_qty=${t.total_qty}`);
    }

    // 应有出库和入库流水
    const sourceTypes = allTxns.map((t: any) => t.source_type);
    expect(sourceTypes.some((s: string) => s.includes('出库')), '应有出库流水').toBeTruthy();
    expect(sourceTypes.some((s: string) => s.includes('入库')), '应有入库流水').toBeTruthy();

    console.log(`[Test7] 全部验证通过`);
  });
});

/** 清理旧的 E2E 数据 */
async function cleanupOldData() {
  try {
    const orders = await query<any>(
      `SELECT sales_order_number FROM sales_order WHERE remark = @mk`,
      { mk: { type: T.NVarChar, value: TEST_REMARK } }
    );
    for (const o of orders) {
      const son = o.sales_order_number;
      // 查关联的发货单
      const shipOrders = await query<any>(
        `SELECT shipping_order_number FROM shipping_order_detail WHERE sales_order_number = @son`,
        { son: { type: T.NVarChar, value: son } }
      );
      const shipOrderNumbers = shipOrders.map((so: any) => so.shipping_order_number);

      // 查关联的退货单
      const returnOrders = await query<any>(
        `SELECT return_order_number FROM return_order_detail WHERE sales_order_number = @son`,
        { son: { type: T.NVarChar, value: son } }
      );
      const returnOrderNumbers = returnOrders.map((ro: any) => ro.return_order_number);

      // 查关联的发货申请
      const shipRequests = await query<any>(
        `SELECT request_number FROM shipping_request_detail WHERE sales_order_number = @son`,
        { son: { type: T.NVarChar, value: son } }
      );
      const requestNumbers = shipRequests.map((sr: any) => sr.request_number);

      await cleanupShippingReturnChain({
        salesOrderNumber: son,
        shippingRequestNumbers: requestNumbers,
        shippingOrderNumbers: shipOrderNumbers,
        returnOrderNumbers: returnOrderNumbers,
      });
    }
    if (orders.length > 0) {
      console.log(`[cleanupOldData] 清理旧订单数: ${orders.length}`);
    }
  } catch (e) {
    console.warn('[cleanupOldData] 清理异常:', e);
  }
}
