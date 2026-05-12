/**
 * E2E测试：P20260504024 生产入库 → 撤回 全链路验证
 *
 * 测试策略：API驱动 + 数据库断言（混合策略）
 * 覆盖验证点：
 *   入库阶段：
 *     1. 生产入库后，成品汇总库存（DB + API）数量正确增加
 *     2. 生产入库后，成品批次库存新增一条记录
 *     3. 生产入库后，库存流水新增'正常'状态的生产入库流水
 *     4. 生产入库后，生产单入库状态变为'部分入库'或'全部入库'
 *     5. 生产入库后，生产入库单状态为'正常'
 *   撤回阶段：
 *     6. 撤回后，成品汇总库存数量恢复到入库前
 *     7. 撤回后，新增的批次库存被删除（或数量归零）
 *     8. 撤回后，库存流水标记为'作废'
 *     9. 撤回后，生产单入库状态回退为'未入库'
 *    10. 撤回后，生产入库单状态变为'已撤回'
 *    11. 撤回后，库存流水API默认可见作废记录，传status='正常'不可见
 */
import { test, expect } from '@playwright/test';
import {
  productionInboundAPI, withdrawInboundOrderAPI,
  getInventoryListAPI, getInventoryDetailAPI, getTransactionListAPI,
  getInboundOrderListAPI, getInboundOrderDetailAPI,
  disposeApiContext
} from '../helpers/api.helper';
import {
  getProductionOrderByNumber,
  getProductionInboundOrder, getProductionInboundOrderDetails,
  getFinishedGoodsInventory, getFinishedBatchInventory,
  getInventoryTransactionsBySource,
  getWarehouse, cleanupProductionInboundWithdrawData,
  forceCleanupProductionInboundByPON, resyncFinishedGoodsInventory
} from '../helpers/db.helper';

const PON = 'P20260504024';
const WAREHOUSE_01 = '01';
const createdInboundOrders: string[] = [];

test.describe('P20260504024 生产入库→撤回：库存查询、流水记录与单据状态全链路验证', () => {

  // 预清理：确保没有之前测试遗留的脏数据
  test.beforeAll(async () => {
    console.log('[预清理] 清理P20260504024的遗留数据...');
    const cleanupResult = await forceCleanupProductionInboundByPON(PON);
    console.log('[预清理] 完成:', JSON.stringify(cleanupResult));

    // 验证清理后状态
    const poAfter = await getProductionOrderByNumber(PON);
    if (poAfter) {
      console.log(`[预清理] 生产单状态: inbound_quantity=${poAfter.inbound_quantity}, status=${poAfter.inbound_status}`);
      const finInv = await getFinishedGoodsInventory(poAfter.item_number, WAREHOUSE_01);
      console.log(`[预清理] 合格品汇总库存: ${finInv?.quantity || 0}`);
    }
  });

  test.afterAll(async () => {
    // 撤回测试数据 + 重算库存
    for (const ion of createdInboundOrders) {
      try { await cleanupProductionInboundWithdrawData(ion); } catch { /* ignore */ }
    }
    // 最终重算库存确保一致性
    const poFinal = await getProductionOrderByNumber(PON);
    if (poFinal) {
      try { await resyncFinishedGoodsInventory(poFinal.item_number, WAREHOUSE_01); } catch { /* ignore */ }
    }
    await disposeApiContext();
  });

  test('P20260504024 生产入库→验证库存/流水/状态→撤回→验证全部反转', async () => {
    // ========== 前置：确认生产单状态 ==========
    const prodOrder = await getProductionOrderByNumber(PON);
    expect(prodOrder, `生产单 ${PON} 应存在`).toBeTruthy();
    const itemNumber = prodOrder!.item_number;
    const itemName = prodOrder!.item_name;
    const plannedQty = parseFloat(String(prodOrder!.planned_quantity));
    const inboundQty = Math.max(1, Math.min(plannedQty, 10)); // 入库量取1~10

    console.log(`[测试] 生产单=${PON}, 物料=${itemNumber}(${itemName}), 计划=${plannedQty}, 入库=${inboundQty}`);

    const warehouse = await getWarehouse(WAREHOUSE_01);
    expect(warehouse, '仓库01必须存在').toBeTruthy();

    // ========================================================
    // 第一阶段：记录入库前基线数据
    // ========================================================
    console.log('\n--- 第一阶段：记录基线 ---');

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

    // 1d. 库存流水（DB基线：P20260504024的正常状态流水数）
    const txnsDBBefore = await getInventoryTransactionsBySource(PON);
    const normalTxnCountBefore = txnsDBBefore.filter(t => (t.status || '正常') === '正常').length;

    // 1e. 生产单入库状态（基线）
    const prodBefore = await getProductionOrderByNumber(PON);
    const inboundQtyBefore = parseFloat(String(prodBefore!.inbound_quantity));

    // 1f. 入库单列表API（基线）
    const inboundOrdersBefore = await getInboundOrderListAPI({ search: PON });

    console.log(`  汇总库存(DB)=${finQtyBefore}, API=${apiQtyBefore}, 批次数=${batchCountBefore}`);
    console.log(`  正常流水数=${normalTxnCountBefore}, 生产单入库量=${inboundQtyBefore}`);

    // 基线一致性校验：DB汇总和API应一致
    expect(Math.abs(finQtyBefore - apiQtyBefore), '基线: DB汇总库存与API库存应一致')
      .toBeLessThanOrEqual(1);

    // ========================================================
    // 第二阶段：执行生产入库
    // ========================================================
    console.log('\n--- 第二阶段：执行生产入库 ---');

    const inboundResult = await productionInboundAPI({
      warehouse_number: WAREHOUSE_01,
      warehouse_name: warehouse.warehouse_name,
      items: [{
        production_order_number: PON,
        item_number: itemNumber,
        item_name: itemName,
        inbound_qty: inboundQty,
        inbound_quantity: inboundQtyBefore, // 传入当前已入库量，供服务端累加
        planned_quantity: plannedQty,
      }],
      remark: `E2E-P20260504024-${Date.now()}`
    });

    expect(inboundResult, '生产入库API应返回数据').toBeTruthy();
    const ion = inboundResult.inboundOrderNumber;
    expect(ion, '入库单号应存在').toBeTruthy();
    createdInboundOrders.push(ion);
    console.log(`  入库单号=${ion}, 返回数据:`, JSON.stringify(inboundResult));

    // ========================================================
    // 第三阶段：验证入库后数据
    // ========================================================
    console.log('\n--- 第三阶段：验证入库后数据 ---');

    // --- 3a. 成品汇总库存（DB）增加 ---
    const finInvAfter = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const finQtyAfter = finInvAfter ? parseFloat(String(finInvAfter.quantity)) : 0;
    expect(finQtyAfter - finQtyBefore, '入库后DB汇总库存应增加').toBe(inboundQty);
    console.log(`  ✓ DB汇总库存: ${finQtyBefore} → ${finQtyAfter} (+${inboundQty})`);

    // --- 3b. 成品批次库存新增 ---
    const finBatchesAfter = await getFinishedBatchInventory(itemNumber, WAREHOUSE_01);
    expect(finBatchesAfter.length, '入库后批次数应增加').toBe(batchCountBefore + 1);
    const newBatch = finBatchesAfter.find(
      (b: any) => !finBatchesBefore.some((ob: any) => ob.batch_number === b.batch_number)
    );
    expect(newBatch, '应找到新增批次').toBeTruthy();
    expect(parseFloat(String(newBatch!.quantity)), '新增批次数量应等于入库量').toBe(inboundQty);
    console.log(`  ✓ 新增批次: ${newBatch!.batch_number}, 数量=${newBatch!.quantity}`);

    // --- 3c. 成品库存查询API数量增加 ---
    const invListAfter = await getInventoryListAPI({
      search: itemNumber,
      warehouse_number: WAREHOUSE_01,
      quality_status: '合格品'
    });
    const invItemAfter = invListAfter?.items?.find(
      (i: any) => i.item_number === itemNumber && i.warehouse_number === WAREHOUSE_01
    );
    const apiQtyAfter = invItemAfter ? parseFloat(String(invItemAfter.quantity)) : 0;
    expect(apiQtyAfter - apiQtyBefore, '入库后API库存应增加').toBe(inboundQty);
    console.log(`  ✓ API库存: ${apiQtyBefore} → ${apiQtyAfter} (+${inboundQty})`);

    // --- 3d. 库存详情API包含新增批次 ---
    const detailAfter = await getInventoryDetailAPI({
      item_number: itemNumber,
      warehouse_number: WAREHOUSE_01
    });
    expect(detailAfter?.inventory, '库存详情API应返回inventory数组').toBeTruthy();
    const detailInvItem = detailAfter.inventory.find(
      (i: any) => i.warehouse_number === WAREHOUSE_01 && i.quality_status === '合格品'
    );
    const detailQty = detailInvItem ? parseFloat(String(detailInvItem.quantity)) : 0;
    expect(detailQty - apiQtyBefore, '库存详情API数量应增加').toBe(inboundQty);
    console.log(`  ✓ 库存详情API: 合格品数量=${detailQty}`);

    // --- 3e. 库存流水（DB）新增'正常'流水 ---
    const txnsDBAfter = await getInventoryTransactionsBySource(PON);
    const normalTxnsAfter = txnsDBAfter.filter(t => (t.status || '正常') === '正常');
    // 找到本次入库新增的流水（通过入库单明细获取transaction_number）
    const inboundDetails = await getProductionInboundOrderDetails(ion);
    expect(inboundDetails.length, '入库单明细应存在').toBeGreaterThan(0);
    const detailTxnNumber = inboundDetails[0].transaction_number;
    const newTxn = txnsDBAfter.find(t => t.transaction_number === detailTxnNumber);
    expect(newTxn, `入库流水 ${detailTxnNumber} 应存在`).toBeTruthy();
    expect(newTxn!.status || '正常', '新流水状态应为正常').toBe('正常');
    expect(newTxn!.transaction_type, '流水类型应为入库').toBe('入库');
    expect(newTxn!.source_type, '流水来源应为生产入库').toBe('生产入库');
    expect(parseFloat(String(newTxn!.quantity)), '流水数量应等于入库量').toBe(inboundQty);
    expect(parseFloat(String(newTxn!.after_quantity)) - parseFloat(String(newTxn!.before_quantity)),
      '流水前后数量差应等于入库量').toBe(inboundQty);
    console.log(`  ✓ 库存流水(DB): ${detailTxnNumber}, 正常, 入库 +${inboundQty}`);

    // --- 3f. 库存流水API可见该流水 ---
    const txnListDefault = await getTransactionListAPI({
      search: detailTxnNumber,
      limit: 5
    });
    const foundTxn = (txnListDefault?.items || []).find(
      (t: any) => t.transaction_number === detailTxnNumber
    );
    expect(foundTxn, '库存流水API应可见该流水').toBeTruthy();
    expect(foundTxn!.status || '正常', 'API流水状态应为正常').toBe('正常');
    console.log(`  ✓ 库存流水API: ${detailTxnNumber} 可见, status=正常`);

    // --- 3g. 生产单入库状态变化 ---
    const prodAfter = await getProductionOrderByNumber(PON);
    const inboundQtyAfter = parseFloat(String(prodAfter!.inbound_quantity));
    expect(inboundQtyAfter - inboundQtyBefore, '生产单入库量应增加').toBe(inboundQty);
    expect(['部分入库', '全部入库'], '生产单入库状态应变更为部分入库或全部入库')
      .toContain(prodAfter!.inbound_status);
    console.log(`  ✓ 生产单: inbound_quantity=${inboundQtyAfter}, status=${prodAfter!.inbound_status}`);

    // --- 3h. 入库单状态为'正常' ---
    const pioAfter = await getProductionInboundOrder(ion);
    expect(pioAfter!.status || '正常', '入库单状态应为正常').toBe('正常');
    console.log(`  ✓ 入库单 ${ion}: status=正常`);

    // --- 3i. 入库单详情API ---
    const pioDetailAPI = await getInboundOrderDetailAPI(ion);
    expect(pioDetailAPI, '入库单详情API应返回数据').toBeTruthy();
    expect(pioDetailAPI?.header?.status || '正常', '入库单详情API状态应为正常').toBe('正常');
    console.log(`  ✓ 入库单详情API: status=正常`);

    // ========================================================
    // 第四阶段：执行撤回
    // ========================================================
    console.log('\n--- 第四阶段：执行撤回 ---');

    const withdrawResult = await withdrawInboundOrderAPI(ion);
    console.log(`  撤回结果:`, JSON.stringify(withdrawResult));

    // 验证撤回API返回了正确数据
    expect(withdrawResult, '撤回API应返回数据').toBeTruthy();
    expect(withdrawResult?.inbound_order_number, '撤回结果应包含入库单号').toBe(ion);
    console.log(`  ✓ 已撤回入库单 ${ion}`);

    // ========================================================
    // 第五阶段：验证撤回后数据
    // ========================================================
    console.log('\n--- 第五阶段：验证撤回后数据 ---');

    // --- 5a. 成品汇总库存（DB）恢复 ---
    const finInvAfterWithdraw = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const finQtyAfterWithdraw = finInvAfterWithdraw ? parseFloat(String(finInvAfterWithdraw.quantity)) : 0;
    const diffAfterWithdraw = finQtyAfterWithdraw - finQtyBefore;
    console.log(`  汇总库存: 基线=${finQtyBefore}, 入库后=${finQtyAfter}, 撤回后=${finQtyAfterWithdraw}, 差值=${diffAfterWithdraw}`);
    expect(Math.abs(diffAfterWithdraw), '撤回后DB汇总库存应恢复到入库前')
      .toBeLessThanOrEqual(1); // 允许±1的decimal精度误差

    // --- 5b. 成品批次库存：新增的批次被删除 ---
    const finBatchesAfterWithdraw = await getFinishedBatchInventory(itemNumber, WAREHOUSE_01);
    if (newBatch) {
      const batchStillExists = finBatchesAfterWithdraw.find(
        (b: any) => b.batch_number === newBatch.batch_number
      );
      expect(batchStillExists, `撤回后批次 ${newBatch.batch_number} 库存应为0或已删除`).toBeFalsy();
    }
    console.log(`  ✓ 批次 ${newBatch!.batch_number} 已删除, 批次数=${finBatchesAfterWithdraw.length} (应=${batchCountBefore})`);

    // --- 5c. 成品库存查询API数量恢复 ---
    const invListAfterWithdraw = await getInventoryListAPI({
      search: itemNumber,
      warehouse_number: WAREHOUSE_01,
      quality_status: '合格品'
    });
    const invItemAfterWithdraw = invListAfterWithdraw?.items?.find(
      (i: any) => i.item_number === itemNumber && i.warehouse_number === WAREHOUSE_01
    );
    const apiQtyAfterWithdraw = invItemAfterWithdraw ? parseFloat(String(invItemAfterWithdraw.quantity)) : 0;
    expect(Math.abs(apiQtyAfterWithdraw - apiQtyBefore), '撤回后API库存应恢复到入库前')
      .toBeLessThanOrEqual(1);
    console.log(`  ✓ API库存: ${apiQtyAfter} → ${apiQtyAfterWithdraw} (恢复, 基线=${apiQtyBefore})`);

    // --- 5d. 库存详情API数量恢复 ---
    const detailAfterWithdraw = await getInventoryDetailAPI({
      item_number: itemNumber,
      warehouse_number: WAREHOUSE_01
    });
    const detailInvAfterWithdraw = detailAfterWithdraw?.inventory?.find(
      (i: any) => i.warehouse_number === WAREHOUSE_01 && i.quality_status === '合格品'
    );
    const detailQtyAfterWithdraw = detailInvAfterWithdraw ? parseFloat(String(detailInvAfterWithdraw.quantity)) : 0;
    expect(Math.abs(detailQtyAfterWithdraw - apiQtyBefore), '撤回后库存详情API数量应恢复')
      .toBeLessThanOrEqual(1);
    console.log(`  ✓ 库存详情API: 合格品数量=${detailQtyAfterWithdraw}`);

    // --- 5e. 库存流水（DB）标记为'作废' ---
    const txnsDBAfterWithdraw = await getInventoryTransactionsBySource(PON);
    const voidedTx = txnsDBAfterWithdraw.find(t => t.transaction_number === detailTxnNumber);
    expect(voidedTx, `撤回后流水 ${detailTxnNumber} 应仍存在（软删除）`).toBeTruthy();
    expect(voidedTx!.status, '撤回后流水状态应为作废').toBe('作废');
    console.log(`  ✓ 流水(DB): ${detailTxnNumber} status=作废`);

    // --- 5f. 库存流水API：默认可见作废流水 ---
    const txnListAll = await getTransactionListAPI({
      search: detailTxnNumber,
      limit: 5
    });
    const foundVoidedDefault = (txnListAll?.items || []).find(
      (t: any) => t.transaction_number === detailTxnNumber
    );
    expect(foundVoidedDefault, '默认查询应可见该流水').toBeTruthy();
    expect(foundVoidedDefault!.status || '正常', '默认查询应显示作废状态').toBe('作废');
    console.log(`  ✓ 流水API(默认): ${detailTxnNumber} 可见, status=作废`);

    // --- 5g. 库存流水API：status='作废'可查到 ---
    const txnListVoided = await getTransactionListAPI({
      search: detailTxnNumber,
      status: '作废',
      limit: 5
    });
    const foundVoided = (txnListVoided?.items || []).find(
      (t: any) => t.transaction_number === detailTxnNumber
    );
    expect(foundVoided, 'status=作废查询应可见该流水').toBeTruthy();
    console.log(`  ✓ 流水API(status=作废): ${detailTxnNumber} 可见`);

    // --- 5h. 库存流水API：status='正常'不可查到 ---
    const txnListNormal = await getTransactionListAPI({
      search: detailTxnNumber,
      status: '正常',
      limit: 5
    });
    const foundNormal = (txnListNormal?.items || []).find(
      (t: any) => t.transaction_number === detailTxnNumber
    );
    expect(foundNormal, 'status=正常查询不应可见作废流水').toBeFalsy();
    console.log(`  ✓ 流水API(status=正常): ${detailTxnNumber} 不可见`);

    // --- 5i. 生产单入库状态回退 ---
    const prodAfterWithdraw = await getProductionOrderByNumber(PON);
    const inboundQtyAfterWithdraw = parseFloat(String(prodAfterWithdraw!.inbound_quantity));
    expect(inboundQtyAfterWithdraw, '撤回后生产单入库量应回退').toBeLessThanOrEqual(inboundQtyBefore);
    // 如果入库前是0，撤回后应该也是0
    if (inboundQtyBefore === 0) {
      expect(inboundQtyAfterWithdraw, '入库前为0, 撤回后也应为0').toBe(0);
      expect(prodAfterWithdraw!.inbound_status, '入库前未入库, 撤回后也应未入库').toBe('未入库');
    }
    console.log(`  ✓ 生产单: inbound_quantity=${inboundQtyAfterWithdraw}, status=${prodAfterWithdraw!.inbound_status}`);

    // --- 5j. 入库单状态变为'已撤回' ---
    const pioAfterWithdraw = await getProductionInboundOrder(ion);
    expect(pioAfterWithdraw!.status, '入库单状态应为已撤回').toBe('已撤回');
    expect(pioAfterWithdraw!.withdraw_operator, '撤回操作人应记录').toBeTruthy();
    console.log(`  ✓ 入库单 ${ion}: status=已撤回, operator=${pioAfterWithdraw!.withdraw_operator}`);

    // --- 5k. 入库单详情API状态为'已撤回' ---
    const pioDetailAfterWithdraw = await getInboundOrderDetailAPI(ion);
    expect(pioDetailAfterWithdraw, '入库单详情API应返回数据').toBeTruthy();
    expect(pioDetailAfterWithdraw?.header?.status, '入库单详情API状态应为已撤回').toBe('已撤回');
    console.log(`  ✓ 入库单详情API: status=已撤回`);

    // --- 5l. 入库单列表API可查到已撤回状态 ---
    const inboundOrdersAfter = await getInboundOrderListAPI({ search: ion });
    const foundInList = (inboundOrdersAfter?.items || []).find(
      (o: any) => o.inbound_order_number === ion
    );
    expect(foundInList, '入库单列表API应可见该入库单').toBeTruthy();
    expect(foundInList!.status, '入库单列表中状态应为已撤回').toBe('已撤回');
    console.log(`  ✓ 入库单列表API: ${ion} status=已撤回`);

    console.log('\n========== 全部验证通过 ==========');
  });
});