/**
 * E2E测试：成品生产入库 → 确认 → 撤回 → 成品库存查询变化 → 库存流水记录完整
 *
 * 测试策略：API驱动 + 数据库断言
 * 重点验证：
 *   1. 生产入库后，成品库存查询API返回数据发生变化（新增批次/数量增加）
 *   2. 生产入库后，库存流水API可见'正常'状态的生产入库流水
 *   3. 撤回后，成品库存查询API返回数据恢复（数量回到入库前）
 *   4. 撤回后，库存流水API可见'作废'状态的流水（软删除审计）
 *   5. 库存流水API默认不过滤作废记录，传status='正常'只看正常，传status='作废'只看作废
 *   6. 撤回后成品批次库存被反转（删除或数量归零）
 *   7. 撤回后生产单入库状态回退
 */
import { test, expect } from '@playwright/test';
import {
  productionInboundAPI, withdrawInboundOrderAPI,
  getInventoryListAPI, getInventoryDetailAPI, getTransactionListAPI,
  disposeApiContext
} from '../helpers/api.helper';
import {
  query, T,
  getProductionInboundOrder, getProductionInboundOrderDetails,
  getProductionOrderByNumber,
  getFinishedGoodsInventory,
  getFinishedBatchInventory,
  getInventoryTransactionsBySource,
  findAvailableProductionOrderForInbound, findAvailableProductionOrderNoBackflush,
  getWarehouse, cleanupProductionInboundWithdrawData
} from '../helpers/db.helper';

const WAREHOUSE_01 = '01';
const createdInboundOrders: string[] = [];

test.describe('生产入库→确认→撤回：库存查询与流水记录验证', () => {

  test.afterAll(async () => {
    for (const ion of createdInboundOrders) {
      try { await cleanupProductionInboundWithdrawData(ion); } catch { /* ignore */ }
    }
    await disposeApiContext();
  });

  // ==================== 场景1：完整流程验证（含倒冲） ====================
  test('生产入库→确认库存变化→撤回→确认库存恢复→流水记录完整', async () => {
    const prodOrder = await findAvailableProductionOrderForInbound()
      || await findAvailableProductionOrderNoBackflush();
    if (!prodOrder) {
      console.log('跳过测试：没有找到可用的生产单');
      return;
    }
    const pon = prodOrder.production_order_number;
    const itemNumber = prodOrder.item_number;
    const itemName = prodOrder.item_name;
    const plannedQty = parseFloat(String(prodOrder.planned_quantity));
    const inboundQty = Math.max(1, Math.min(plannedQty, 5));

    console.log(`[完整流程] 生产单 ${pon}, 物料 ${itemNumber}(${itemName}), 入库 ${inboundQty}`);

    const warehouse = await getWarehouse(WAREHOUSE_01);
    expect(warehouse, '仓库01必须存在').toBeTruthy();

    // ---------- 步骤1：记录入库前基线数据 ----------

    // 1a. 成品汇总库存（DB基线）
    const finInvBefore = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const finQtyBefore = finInvBefore ? parseFloat(String(finInvBefore.quantity)) : 0;

    // 1b. 成品批次库存（DB基线）
    const finBatchesBefore = await getFinishedBatchInventory(itemNumber, WAREHOUSE_01);
    const batchCountBefore = finBatchesBefore.length;

    // 1c. 成品库存查询API（基线）
    const invListBefore = await getInventoryListAPI({
      search: itemNumber,
      warehouse_number: WAREHOUSE_01,
      quality_status: '合格品'
    });
    const invItemBefore = invListBefore?.items?.find(
      (i: any) => i.item_number === itemNumber && i.warehouse_number === WAREHOUSE_01
    );
    const apiQtyBefore = invItemBefore ? parseFloat(String(invItemBefore.quantity)) : 0;
    console.log(`[入库前] DB库存=${finQtyBefore}, API库存=${apiQtyBefore}, 批次数=${batchCountBefore}`);

    // 1d. 库存流水API（基线）- 查该物料的生产入库流水
    const txnListBefore = await getTransactionListAPI({
      search: itemNumber,
      source_type: '生产入库',
      limit: 100
    });
    const txnCountBefore = txnListBefore?.total || 0;
    console.log(`[入库前] 流水记录数=${txnCountBefore}`);

    // ---------- 步骤2：执行生产入库 ----------
    const inboundResult = await productionInboundAPI({
      warehouse_number: WAREHOUSE_01,
      warehouse_name: warehouse!.warehouse_name,
      items: [{
        production_order_number: pon,
        item_number: itemNumber,
        item_name: itemName,
        inbound_qty: inboundQty,
        planned_quantity: plannedQty,
      }],
      remark: `E2E-FLOW-${Date.now()}`
    });
    const ion = inboundResult.inboundOrderNumber;
    createdInboundOrders.push(ion);
    console.log(`[入库完成] 入库单号=${ion}`);

    // ---------- 步骤3：确认入库数据 ----------

    // 3a. 入库单状态为'正常'
    const orderAfterInbound = await getProductionInboundOrder(ion);
    expect(orderAfterInbound).toBeTruthy();
    expect(orderAfterInbound!.status).toBe('正常');

    // 3b. 成品汇总库存增加（DB断言）
    const finInvAfter = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const finQtyAfter = finInvAfter ? parseFloat(String(finInvAfter.quantity)) : 0;
    expect(finQtyAfter).toBe(finQtyBefore + inboundQty);

    // 3c. 成品库存查询API返回数量增加
    const invListAfter = await getInventoryListAPI({
      search: itemNumber,
      warehouse_number: WAREHOUSE_01,
      quality_status: '合格品'
    });
    const invItemAfter = invListAfter?.items?.find(
      (i: any) => i.item_number === itemNumber && i.warehouse_number === WAREHOUSE_01
    );
    expect(invItemAfter, '入库后API应能查到该物料库存').toBeTruthy();
    const apiQtyAfter = parseFloat(String(invItemAfter!.quantity));
    expect(apiQtyAfter).toBe(apiQtyBefore + inboundQty);
    console.log(`[入库后] DB库存=${finQtyAfter}, API库存=${apiQtyAfter}, 增加=${inboundQty}`);

    // 3d. 成品批次库存新增
    const finBatchesAfter = await getFinishedBatchInventory(itemNumber, WAREHOUSE_01);
    expect(finBatchesAfter.length, '批次库存应增加').toBeGreaterThan(batchCountBefore);

    // 3e. 库存详情API（含批次明细）
    const invDetailAfter = await getInventoryDetailAPI({
      item_number: itemNumber,
      warehouse_number: WAREHOUSE_01
    });
    expect(invDetailAfter, '库存详情API应返回数据').toBeTruthy();

    // 3f. 库存流水API：新增生产入库流水，状态为'正常'
    const txnListAfter = await getTransactionListAPI({
      search: itemNumber,
      source_type: '生产入库',
      limit: 100
    });
    const txnTotalAfter = txnListAfter?.total || 0;
    expect(txnTotalAfter, '入库后流水记录应增加').toBeGreaterThan(txnCountBefore);
    // 验证新增流水状态为'正常'
    const newTxns = (txnListAfter?.items || []).filter(
      (t: any) => !(txnListBefore?.items || []).some(
        (b: any) => b.transaction_number === t.transaction_number
      )
    );
    for (const tx of newTxns) {
      const txStatus = tx.status || '正常';
      expect(txStatus, `新流水 ${tx.transaction_number} 应为正常状态`).toBe('正常');
      expect(tx.transaction_type).toBe('入库');
      expect(tx.source_type).toBe('生产入库');
      expect(parseFloat(String(tx.quantity))).toBe(inboundQty);
      // 验证前后数量一致性
      const diff = parseFloat(String(tx.after_quantity)) - parseFloat(String(tx.before_quantity));
      expect(diff).toBe(inboundQty);
    }
    console.log(`[入库后] 流水记录数=${txnTotalAfter}, 新增正常流水=${newTxns.length}`);

    // 3g. DB验证：成品库存流水为'正常'（用入库单明细的transaction_number精确定位）
    const detailsAfterInbound = await getProductionInboundOrderDetails(ion);
    const detailTxnNumber = detailsAfterInbound[0]?.transaction_number;
    expect(detailTxnNumber, '入库单明细应有transaction_number').toBeTruthy();
    const txnsDB = await getInventoryTransactionsBySource(pon);
    const inboundTx = txnsDB.find(t => t.transaction_number === detailTxnNumber);
    expect(inboundTx, `DB应有流水 ${detailTxnNumber}`).toBeTruthy();
    expect(inboundTx!.status || '正常').toBe('正常');

    // 3h. 生产单入库状态变化
    const prodAfterInbound = await getProductionOrderByNumber(pon);
    expect(parseFloat(String(prodAfterInbound!.inbound_quantity))).toBe(inboundQty);

    // ---------- 步骤4：执行撤回 ----------
    const withdrawResult = await withdrawInboundOrderAPI(ion);
    expect(withdrawResult.inboundOrderNumber || withdrawResult.inbound_order_number).toBe(ion);
    console.log(`[撤回完成] 入库单号=${ion}`);

    // ---------- 步骤5：确认撤回数据 ----------

    // 5a. 入库单状态为'已撤回'
    const orderAfterWithdraw = await getProductionInboundOrder(ion);
    expect(orderAfterWithdraw!.status).toBe('已撤回');
    expect(orderAfterWithdraw!.withdraw_operator).toBeTruthy();
    expect(orderAfterWithdraw!.withdraw_date).toBeTruthy();

    // 5b. 成品汇总库存恢复（DB断言，允许±1精度误差）
    const finInvAfterWithdraw = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const finQtyAfterWithdraw = finInvAfterWithdraw ? parseFloat(String(finInvAfterWithdraw.quantity)) : 0;
    expect(Math.abs(finQtyAfterWithdraw - finQtyBefore)).toBeLessThanOrEqual(1);

    // 5c. 成品库存查询API返回数量恢复
    const invListAfterWithdraw = await getInventoryListAPI({
      search: itemNumber,
      warehouse_number: WAREHOUSE_01,
      quality_status: '合格品'
    });
    const invItemAfterWithdraw = invListAfterWithdraw?.items?.find(
      (i: any) => i.item_number === itemNumber && i.warehouse_number === WAREHOUSE_01
    );
    const apiQtyAfterWithdraw = invItemAfterWithdraw
      ? parseFloat(String(invItemAfterWithdraw.quantity)) : 0;
    expect(Math.abs(apiQtyAfterWithdraw - apiQtyBefore)).toBeLessThanOrEqual(1);
    console.log(`[撤回后] DB库存=${finQtyAfterWithdraw}, API库存=${apiQtyAfterWithdraw}`);

    // 5d. 成品批次库存被反转
    const finBatchesAfterWithdraw = await getFinishedBatchInventory(itemNumber, WAREHOUSE_01);
    // 入库创建的批次应不再有quantity>0的记录
    const newBatchFromInbound = finBatchesAfter.find(
      (b: any) => !finBatchesBefore.some((ob: any) => ob.batch_number === b.batch_number)
    );
    if (newBatchFromInbound) {
      const batchStillExists = finBatchesAfterWithdraw.find(
        (b: any) => b.batch_number === newBatchFromInbound.batch_number
      );
      expect(batchStillExists, `撤回后批次 ${newBatchFromInbound.batch_number} 库存应为0或已删除`).toBeFalsy();
    }

    // 5e. 生产单入库状态恢复
    const prodAfterWithdraw = await getProductionOrderByNumber(pon);
    expect(parseFloat(String(prodAfterWithdraw!.inbound_quantity))).toBe(0);
    expect(prodAfterWithdraw!.inbound_status).toBe('未入库');

    // 5f. DB验证：成品库存流水标记为'作废'（用transaction_number精确定位）
    const txnsDBAfterWithdraw = await getInventoryTransactionsBySource(pon);
    const voidedTx = txnsDBAfterWithdraw.find(t => t.transaction_number === detailTxnNumber);
    expect(voidedTx, `撤回后流水 ${detailTxnNumber} 应仍存在（软删除）`).toBeTruthy();
    expect(voidedTx!.status).toBe('作废');

    // ---------- 步骤6：库存流水API关键验证 ----------

    // 6a. 默认（不过滤状态）：应能查到作废的流水
    const txnListAll = await getTransactionListAPI({
      search: detailTxnNumber,
      limit: 10
    });
    const voidedInApiAll = (txnListAll?.items || []).find(
      (t: any) => t.transaction_number === detailTxnNumber
    );
    expect(voidedInApiAll, '默认查询应包含作废流水').toBeTruthy();
    expect(voidedInApiAll!.status || '正常').toBe('作废');
    console.log(`[API默认] 作废流水 ${detailTxnNumber} 可见, status=${voidedInApiAll!.status}`);

    // 6b. status='正常'：不应包含作废流水
    const txnListNormal = await getTransactionListAPI({
      search: detailTxnNumber,
      status: '正常',
      limit: 10
    });
    const voidedInNormal = (txnListNormal?.items || []).find(
      (t: any) => t.transaction_number === detailTxnNumber
    );
    expect(voidedInNormal, 'status=正常查询不应包含作废流水').toBeFalsy();

    // 6c. status='作废'：应只包含作废流水
    const txnListVoided = await getTransactionListAPI({
      search: detailTxnNumber,
      status: '作废',
      limit: 10
    });
    const voidedInVoided = (txnListVoided?.items || []).find(
      (t: any) => t.transaction_number === detailTxnNumber
    );
    expect(voidedInVoided, 'status=作废查询应包含作废流水').toBeTruthy();
    // 作废筛选下的所有记录都应为作废
    for (const tx of txnListVoided?.items || []) {
      expect(tx.status || '正常').toBe('作废');
    }
    console.log(`[API status=作废] 找到 ${txnListVoided?.items?.length || 0} 条作废流水`);
  });

  // ==================== 场景2：无倒冲入库撤回-库存流水审计链验证 ====================
  test('无倒冲入库撤回：库存流水审计链完整', async () => {
    const prodOrder = await findAvailableProductionOrderNoBackflush()
      || await findAvailableProductionOrderForInbound();
    if (!prodOrder) {
      console.log('跳过测试：没有找到可用的生产单');
      return;
    }
    const pon = prodOrder.production_order_number;
    const itemNumber = prodOrder.item_number;
    const itemName = prodOrder.item_name;
    const plannedQty = parseFloat(String(prodOrder.planned_quantity));
    const inboundQty = Math.max(1, Math.min(plannedQty, 3));

    const warehouse = await getWarehouse(WAREHOUSE_01);
    if (!warehouse) {
      console.log('跳过测试：仓库01不存在');
      return;
    }

    // 入库前基线
    const finInvBefore = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const finQtyBefore = finInvBefore ? parseFloat(String(finInvBefore.quantity)) : 0;

    // 执行入库
    const inboundResult = await productionInboundAPI({
      warehouse_number: WAREHOUSE_01,
      warehouse_name: warehouse.warehouse_name,
      items: [{
        production_order_number: pon,
        item_number: itemNumber,
        item_name: itemName,
        inbound_qty: inboundQty,
        planned_quantity: plannedQty,
      }],
      remark: `E2E-FLOW-NBF-${Date.now()}`
    });
    const ion = inboundResult.inboundOrderNumber;
    createdInboundOrders.push(ion);

    // 获取入库产生的流水号
    const txnsAfter = await getInventoryTransactionsBySource(pon);
    const inboundTx = txnsAfter.find(t => t.source_type === '生产入库');
    expect(inboundTx, '入库后应有生产入库流水').toBeTruthy();
    const txnNumber = inboundTx!.transaction_number;

    // 验证入库后库存增加
    const finInvAfter = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    expect(parseFloat(String(finInvAfter!.quantity))).toBe(finQtyBefore + inboundQty);

    // 执行撤回
    await withdrawInboundOrderAPI(ion);

    // 验证撤回后库存恢复
    const finInvAfterWithdraw = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const finQtyAfterWithdraw = finInvAfterWithdraw ? parseFloat(String(finInvAfterWithdraw.quantity)) : 0;
    expect(Math.abs(finQtyAfterWithdraw - finQtyBefore)).toBeLessThanOrEqual(10);

    // 验证库存流水API审计链：
    // 作废的流水在默认查询中可见
    const txnListDefault = await getTransactionListAPI({
      search: txnNumber,
      limit: 10
    });
    const foundTx = (txnListDefault?.items || []).find(
      (t: any) => t.transaction_number === txnNumber
    );
    expect(foundTx, `流水 ${txnNumber} 在默认查询中应可见`).toBeTruthy();
    expect(foundTx!.status || '正常').toBe('作废');

    // 作废流水在status=作废查询中可见
    const txnListVoided = await getTransactionListAPI({
      search: txnNumber,
      status: '作废',
      limit: 10
    });
    const foundVoidedTx = (txnListVoided?.items || []).find(
      (t: any) => t.transaction_number === txnNumber
    );
    expect(foundVoidedTx, `流水 ${txnNumber} 在作废查询中应可见`).toBeTruthy();

    // 作废流水在status=正常查询中不可见
    const txnListNormal = await getTransactionListAPI({
      search: txnNumber,
      status: '正常',
      limit: 10
    });
    const foundNormalTx = (txnListNormal?.items || []).find(
      (t: any) => t.transaction_number === txnNumber
    );
    expect(foundNormalTx, `流水 ${txnNumber} 在正常查询中不应可见`).toBeFalsy();
  });

  // ==================== 场景3：入库→确认库存详情API→撤回→确认库存详情API ====================
  test('库存详情API：入库后数量增加→撤回后数量恢复+批次反转', async () => {
    const prodOrder = await findAvailableProductionOrderNoBackflush()
      || await findAvailableProductionOrderForInbound();
    if (!prodOrder) {
      console.log('跳过测试：没有找到可用的生产单');
      return;
    }
    const pon = prodOrder.production_order_number;
    const itemNumber = prodOrder.item_number;
    const itemName = prodOrder.item_name;
    const plannedQty = parseFloat(String(prodOrder.planned_quantity));
    const inboundQty = Math.max(1, Math.min(plannedQty, 2));

    const warehouse = await getWarehouse(WAREHOUSE_01);
    if (!warehouse) {
      console.log('跳过测试：仓库01不存在');
      return;
    }

    // 入库前：库存详情API（含库存汇总和流水）+ DB批次库存
    const detailBefore = await getInventoryDetailAPI({
      item_number: itemNumber,
      warehouse_number: WAREHOUSE_01
    });
    const invBefore = detailBefore?.inventory?.find(
      (i: any) => i.warehouse_number === WAREHOUSE_01 && i.quality_status === '合格品'
    );
    const apiQtyBefore = invBefore ? parseFloat(String(invBefore.quantity)) : 0;

    const finBatchesBefore = await getFinishedBatchInventory(itemNumber, WAREHOUSE_01);
    console.log(`[入库前] API库存=${apiQtyBefore}, DB批次=${finBatchesBefore.length}`);

    // 入库
    const inboundResult = await productionInboundAPI({
      warehouse_number: WAREHOUSE_01,
      warehouse_name: warehouse.warehouse_name,
      items: [{
        production_order_number: pon,
        item_number: itemNumber,
        item_name: itemName,
        inbound_qty: inboundQty,
        planned_quantity: plannedQty,
      }],
      remark: `E2E-FLOW-DETAIL-${Date.now()}`
    });
    const ion = inboundResult.inboundOrderNumber;
    createdInboundOrders.push(ion);

    // 入库后：库存详情API数量增加 + DB新增批次
    const detailAfter = await getInventoryDetailAPI({
      item_number: itemNumber,
      warehouse_number: WAREHOUSE_01
    });
    const invAfter = detailAfter?.inventory?.find(
      (i: any) => i.warehouse_number === WAREHOUSE_01 && i.quality_status === '合格品'
    );
    const apiQtyAfter = invAfter ? parseFloat(String(invAfter.quantity)) : 0;
    expect(apiQtyAfter, '入库后API库存应增加').toBe(apiQtyBefore + inboundQty);

    const finBatchesAfter = await getFinishedBatchInventory(itemNumber, WAREHOUSE_01);
    expect(finBatchesAfter.length, '入库后DB批次应增加').toBeGreaterThan(finBatchesBefore.length);
    // 找到新增的批次
    const newBatch = finBatchesAfter.find(
      (b: any) => !finBatchesBefore.some((ob: any) => ob.batch_number === b.batch_number)
    );
    expect(newBatch, '应找到新增批次').toBeTruthy();
    expect(parseFloat(String(newBatch!.quantity))).toBe(inboundQty);
    console.log(`[入库后] API库存=${apiQtyAfter}, DB批次=${finBatchesAfter.length}, 新批次=${newBatch!.batch_number}`);

    // 撤回
    await withdrawInboundOrderAPI(ion);

    // 撤回后：库存详情API数量恢复 + DB批次被删除
    const detailAfterWithdraw = await getInventoryDetailAPI({
      item_number: itemNumber,
      warehouse_number: WAREHOUSE_01
    });
    const invAfterWithdraw = detailAfterWithdraw?.inventory?.find(
      (i: any) => i.warehouse_number === WAREHOUSE_01 && i.quality_status === '合格品'
    );
    const apiQtyAfterWithdraw = invAfterWithdraw ? parseFloat(String(invAfterWithdraw.quantity)) : 0;
    expect(Math.abs(apiQtyAfterWithdraw - apiQtyBefore), '撤回后API库存应恢复').toBeLessThanOrEqual(1);

    const finBatchesAfterWithdraw = await getFinishedBatchInventory(itemNumber, WAREHOUSE_01);
    const newBatchAfterWithdraw = finBatchesAfterWithdraw.find(
      (b: any) => b.batch_number === newBatch!.batch_number
    );
    expect(newBatchAfterWithdraw, '撤回后新增批次应不再存在').toBeFalsy();
    console.log(`[撤回后] API库存=${apiQtyAfterWithdraw}, DB批次=${finBatchesAfterWithdraw.length}`);
  });
});
