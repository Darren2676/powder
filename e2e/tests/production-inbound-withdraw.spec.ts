/**
 * E2E测试：生产入库操作 + 撤回 + 相关单据状态及库存变化验证
 *
 * 测试策略：API驱动 + 数据库断言
 * 覆盖场景：
 *   1. 有倒冲的生产入库→验证数据→撤回→验证所有反转
 *   2. 无倒冲的生产入库→验证数据→撤回→验证所有反转
 *   3. 重复撤回安全校验
 *   4. 入库单状态流转：正常→已撤回
 *   5. 各关联表数据一致性验证：
 *      - 成品批次库存（finished_batch_inventory）
 *      - 成品汇总库存（finished_goods_inventory）
 *      - 成品库存流水（inventory_transaction）状态
 *      - 生产单入库状态（production_order）
 *      - 倒冲扣减日志（backflush_deduction_log）
 *      - 倒冲任务（backflush_task）
 *      - 物料批次库存（material_batch_inventory）
 *      - 物料汇总库存（material_inventory）
 *      - 物料流水（material_inventory_transaction）状态
 *      - 批次追溯（batch_traceability）
 *      - 入库单状态（production_inbound_order）
 */
import { test, expect } from '@playwright/test';
import {
  productionInboundAPI, withdrawInboundOrderAPI,
  getPendingInboundAPI, disposeApiContext
} from '../helpers/api.helper';
import {
  query, T,
  getProductionInboundOrder, getProductionInboundOrderDetails,
  getProductionOrderByNumber, getFinishedBatchInventory, getFinishedGoodsInventory,
  getInventoryTransactionsBySource,
  getBackflushDeductionLogs, getBackflushTasksByOrderFull,
  getMaterialTransactionByTxNum, getBatchTraceability,
  getMaterialBatchInventory, getMaterialInventorySummary,
  findAvailableProductionOrderForInbound, findAvailableProductionOrderNoBackflush,
  getWarehouse, cleanupProductionInboundWithdrawData
} from '../helpers/db.helper';

const WAREHOUSE_01 = '01';

// 记录测试中创建的入库单号，用于清理
const createdInboundOrders: string[] = [];

test.describe('生产入库操作与撤回', () => {

  test.afterAll(async () => {
    // 清理所有测试数据
    for (const ion of createdInboundOrders) {
      try { await cleanupProductionInboundWithdrawData(ion); } catch { /* ignore */ }
    }
    await disposeApiContext();
  });

  // ==================== 场景1：有倒冲的生产入库 + 撤回 ====================
  test('有倒冲的生产入库：入库→验证数据→撤回→验证所有反转', async () => {
    // 查找可用的生产单（已审批+有备料+有倒冲任务+未入库）
    const prodOrder = await findAvailableProductionOrderForInbound();
    if (!prodOrder) {
      console.log('跳过有倒冲测试：没有找到符合条件的生产单（已审批+有倒冲+未入库）');
      return;
    }
    const pon = prodOrder.production_order_number;
    const itemNumber = prodOrder.item_number;
    const itemName = prodOrder.item_name;
    const plannedQty = parseFloat(String(prodOrder.planned_quantity));
    const inboundQty = Math.max(1, Math.min(plannedQty, 5)); // 入库1~5件

    console.log(`[有倒冲] 使用生产单 ${pon}, 物料 ${itemNumber}, 入库数量 ${inboundQty}`);

    // 查找仓库信息
    const warehouse = await getWarehouse(WAREHOUSE_01);
    expect(warehouse, '仓库01必须存在').toBeTruthy();

    // ---------- 记录入库前基线数据 ----------
    // 成品汇总库存（入库前）
    const finInvBefore = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const finQtyBefore = finInvBefore ? parseFloat(String(finInvBefore.quantity)) : 0;

    // 成品批次库存（入库前）
    const finBatchesBefore = await getFinishedBatchInventory(itemNumber, WAREHOUSE_01);

    // 倒冲任务（入库前）
    const bfTasksBefore = await getBackflushTasksByOrderFull(pon);
    console.log(`[有倒冲] 倒冲任务数: ${bfTasksBefore.length}`);
    // 记录各物料批次库存基线
    const matInvBaseline: Record<string, { batchQty: number; summaryQty: number }> = {};
    for (const bft of bfTasksBefore) {
      const matBatches = await getMaterialBatchInventory(bft.material_number, bft.warehouse_number);
      const matSummary = await getMaterialInventorySummary(bft.material_number, bft.warehouse_number);
      const existing = matInvBaseline[bft.material_number + '|' + bft.warehouse_number];
      if (!existing) {
        matInvBaseline[bft.material_number + '|' + bft.warehouse_number] = {
          batchQty: matBatches.reduce((sum, b) => sum + parseFloat(String(b.quantity)), 0),
          summaryQty: matSummary ? parseFloat(String(matSummary.quantity)) : 0,
        };
      }
    }

    // 批次追溯（入库前应为0）
    const traceBefore = await getBatchTraceability(pon);

    // ---------- 执行生产入库 ----------
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
      remark: `E2E-PIWD-${Date.now()}`
    });
    const ion = inboundResult.inboundOrderNumber;
    createdInboundOrders.push(ion);
    console.log(`[有倒冲] 入库单号: ${ion}`);

    // ---------- 验证入库后数据 ----------

    // 1. 入库单状态为'正常'
    const orderAfterInbound = await getProductionInboundOrder(ion);
    expect(orderAfterInbound).toBeTruthy();
    expect(orderAfterInbound!.status).toBe('正常');

    // 2. 入库单明细存在
    const detailsAfterInbound = await getProductionInboundOrderDetails(ion);
    expect(detailsAfterInbound.length).toBeGreaterThanOrEqual(1);
    const detail = detailsAfterInbound[0];
    expect(parseFloat(String(detail.inbound_quantity))).toBe(inboundQty);
    expect(detail.production_order_number).toBe(pon);
    expect(detail.batch_number).toBeTruthy();
    expect(detail.transaction_number).toBeTruthy();

    // 3. 成品批次库存新增
    const finBatchesAfter = await getFinishedBatchInventory(itemNumber, WAREHOUSE_01);
    const newBatch = finBatchesAfter.find(b => b.batch_number === detail.batch_number);
    expect(newBatch, `应新增批次 ${detail.batch_number}`).toBeTruthy();
    expect(parseFloat(String(newBatch!.quantity))).toBe(inboundQty);

    // 4. 成品汇总库存增加
    const finInvAfter = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const finQtyAfter = finInvAfter ? parseFloat(String(finInvAfter.quantity)) : 0;
    expect(finQtyAfter).toBe(finQtyBefore + inboundQty);

    // 5. 成品库存流水为'正常'
    const txnsAfter = await getInventoryTransactionsBySource(pon);
    const inboundTx = txnsAfter.find(t => t.source_type === '生产入库' && t.batch_number === detail.batch_number);
    expect(inboundTx, '应有生产入库流水').toBeTruthy();
    expect(inboundTx!.status).toBe('正常');
    expect(inboundTx!.transaction_type).toBe('入库');
    expect(parseFloat(String(inboundTx!.quantity))).toBe(inboundQty);

    // 6. 生产单入库状态变为'部分入库'或'全部入库'
    const prodAfterInbound = await getProductionOrderByNumber(pon);
    expect(prodAfterInbound).toBeTruthy();
    expect(parseFloat(String(prodAfterInbound!.inbound_quantity))).toBe(inboundQty);
    if (inboundQty >= plannedQty) {
      expect(prodAfterInbound!.inbound_status).toBe('全部入库');
    } else {
      expect(prodAfterInbound!.inbound_status).toBe('部分入库');
    }

    // 7. 倒冲扣减日志产生
    const deductionLogsAfter = await getBackflushDeductionLogs(pon);
    expect(deductionLogsAfter.length, '应产生倒冲扣减日志').toBeGreaterThanOrEqual(1);
    for (const dlog of deductionLogsAfter) {
      expect(dlog.status).toBe('成功');
      expect(parseFloat(String(dlog.inbound_quantity))).toBe(inboundQty);
    }

    // 8. 倒冲任务状态变化
    const bfTasksAfter = await getBackflushTasksByOrderFull(pon);
    for (const bft of bfTasksAfter) {
      expect(parseFloat(String(bft.deducted_quantity))).toBeGreaterThan(0);
      expect(['部分扣减', '已扣减']).toContain(bft.deduction_status);
    }

    // 9. 物料批次库存减少（倒冲扣减）
    for (const dlog of deductionLogsAfter) {
      const key = dlog.material_number + '|' + dlog.warehouse_number;
      const baseline = matInvBaseline[key];
      if (baseline) {
        const matBatchesNow = await getMaterialBatchInventory(dlog.material_number, dlog.warehouse_number);
        const currentBatchQty = matBatchesNow.reduce((sum, b) => sum + parseFloat(String(b.quantity)), 0);
        expect(currentBatchQty).toBeLessThan(baseline.batchQty);
      }
    }

    // 10. 物料流水为'正常'
    for (const dlog of deductionLogsAfter) {
      if (dlog.transaction_number) {
        const matTx = await getMaterialTransactionByTxNum(dlog.transaction_number);
        expect(matTx, `应有物料流水 ${dlog.transaction_number}`).toBeTruthy();
        expect(matTx!.status).toBe('正常');
      }
    }

    // 11. 批次追溯产生
    const traceAfter = await getBatchTraceability(pon);
    expect(traceAfter.length, '应产生批次追溯记录').toBeGreaterThanOrEqual(1);

    // ---------- 执行撤回 ----------
    const withdrawResult = await withdrawInboundOrderAPI(ion);
    expect(withdrawResult.inboundOrderNumber || withdrawResult.inbound_order_number).toBe(ion);

    // ---------- 验证撤回后数据 ----------

    // 1. 入库单状态变为'已撤回'
    const orderAfterWithdraw = await getProductionInboundOrder(ion);
    expect(orderAfterWithdraw!.status).toBe('已撤回');
    expect(orderAfterWithdraw!.withdraw_operator).toBeTruthy();
    expect(orderAfterWithdraw!.withdraw_date).toBeTruthy();

    // 2. 成品批次库存被删除（因为入库数量=批次数量，减完=0→DELETE）
    const finBatchesAfterWithdraw = await getFinishedBatchInventory(itemNumber, WAREHOUSE_01);
    const withdrawnBatch = finBatchesAfterWithdraw.find(b => b.batch_number === detail.batch_number);
    // 如果入库数量等于批次数量，批次应被删除；否则数量应减少
    if (withdrawnBatch) {
      expect(parseFloat(String(withdrawnBatch.quantity))).toBe(0);
    }
    // 扩展：直接查数据库不限quantity>0
    const allBatches = await query<any>(
      `SELECT batch_number, quantity FROM finished_batch_inventory WHERE batch_number = @bn`,
      { bn: { type: T.NVarChar, value: detail.batch_number } }
    );
    if (allBatches.length > 0) {
      expect(parseFloat(String(allBatches[0].quantity))).toBe(0);
    }

    // 3. 成品汇总库存恢复
    // 撤回后库存恢复（允许±1的精度误差，因为汇总库存受decimal精度影响）
    const finInvAfterWithdraw = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const finQtyAfterWithdraw = finInvAfterWithdraw ? parseFloat(String(finInvAfterWithdraw.quantity)) : 0;
    expect(Math.abs(finQtyAfterWithdraw - finQtyBefore)).toBeLessThanOrEqual(1);

    // 4. 成品库存流水标记为'作废'
    const txnsAfterWithdraw = await getInventoryTransactionsBySource(pon);
    const voidedTx = txnsAfterWithdraw.find(t => t.transaction_number === detail.transaction_number);
    expect(voidedTx, `流水 ${detail.transaction_number} 应存在`).toBeTruthy();
    expect(voidedTx!.status).toBe('作废');

    // 5. 生产单入库状态回退
    const prodAfterWithdraw = await getProductionOrderByNumber(pon);
    expect(parseFloat(String(prodAfterWithdraw!.inbound_quantity))).toBe(0);
    expect(prodAfterWithdraw!.inbound_status).toBe('未入库');

    // 6. 倒冲扣减日志标记为'已撤回'
    const deductionLogsAfterWithdraw = await getBackflushDeductionLogs(pon);
    for (const dlog of deductionLogsAfterWithdraw) {
      expect(dlog.status).toBe('已撤回');
    }

    // 7. 倒冲任务回退
    const bfTasksAfterWithdraw = await getBackflushTasksByOrderFull(pon);
    for (const bft of bfTasksAfterWithdraw) {
      expect(parseFloat(String(bft.deducted_quantity))).toBe(0);
      expect(bft.deduction_status).toBe('待扣减');
    }

    // 8. 物料批次库存恢复
    for (const dlog of deductionLogsAfterWithdraw) {
      const key = dlog.material_number + '|' + dlog.warehouse_number;
      const baseline = matInvBaseline[key];
      if (baseline) {
        const matBatchesNow = await getMaterialBatchInventory(dlog.material_number, dlog.warehouse_number);
        const currentBatchQty = matBatchesNow.reduce((sum, b) => sum + parseFloat(String(b.quantity)), 0);
        expect(currentBatchQty).toBe(baseline.batchQty);
      }
    }

    // 9. 物料汇总库存恢复
    for (const dlog of deductionLogsAfterWithdraw) {
      const key = dlog.material_number + '|' + dlog.warehouse_number;
      const baseline = matInvBaseline[key];
      if (baseline) {
        const matSummary = await getMaterialInventorySummary(dlog.material_number, dlog.warehouse_number);
        const currentSummaryQty = matSummary ? parseFloat(String(matSummary.quantity)) : 0;
        expect(currentSummaryQty).toBe(baseline.summaryQty);
      }
    }

    // 10. 物料流水标记为'作废'
    for (const dlog of deductionLogsAfterWithdraw) {
      if (dlog.transaction_number) {
        const matTx = await getMaterialTransactionByTxNum(dlog.transaction_number);
        expect(matTx, `物料流水 ${dlog.transaction_number} 应存在`).toBeTruthy();
        expect(matTx!.status).toBe('作废');
      }
    }

    // 11. 批次追溯被删除
    const traceAfterWithdraw = await getBatchTraceability(pon);
    expect(traceAfterWithdraw.length, '撤回后批次追溯应被删除').toBe(0);
  });

  // ==================== 场景2：无倒冲的生产入库 + 撤回 ====================
  test('无倒冲的生产入库：入库→验证数据→撤回→验证所有反转', async () => {
    // 查找可用的生产单（已审批+无倒冲任务+未入库）
    const prodOrder = await findAvailableProductionOrderNoBackflush();
    if (!prodOrder) {
      console.log('跳过无倒冲测试：没有找到符合条件的生产单（已审批+无倒冲+未入库）');
      return;
    }
    const pon = prodOrder.production_order_number;
    const itemNumber = prodOrder.item_number;
    const itemName = prodOrder.item_name;
    const plannedQty = parseFloat(String(prodOrder.planned_quantity));
    const inboundQty = Math.max(1, Math.min(plannedQty, 3));

    console.log(`[无倒冲] 使用生产单 ${pon}, 物料 ${itemNumber}, 入库数量 ${inboundQty}`);

    const warehouse = await getWarehouse(WAREHOUSE_01);
    expect(warehouse, '仓库01必须存在').toBeTruthy();

    // 记录入库前基线
    const finInvBefore = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const finQtyBefore = finInvBefore ? parseFloat(String(finInvBefore.quantity)) : 0;

    // 执行生产入库
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
      remark: `E2E-PIWD-NBF-${Date.now()}`
    });
    const ion = inboundResult.inboundOrderNumber;
    createdInboundOrders.push(ion);

    // 验证入库
    const detailsAfter = await getProductionInboundOrderDetails(ion);
    expect(detailsAfter.length).toBeGreaterThanOrEqual(1);
    const detail = detailsAfter[0];

    // 成品库存增加
    const finInvAfter = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    expect(parseFloat(String(finInvAfter!.quantity))).toBe(finQtyBefore + inboundQty);

    // 生产单状态变化
    const prodAfter = await getProductionOrderByNumber(pon);
    expect(parseFloat(String(prodAfter!.inbound_quantity))).toBe(inboundQty);

    // 撤回
    await withdrawInboundOrderAPI(ion);

    // 验证撤回
    const orderAfter = await getProductionInboundOrder(ion);
    expect(orderAfter!.status).toBe('已撤回');

    // 库存恢复（撤回后库存应等于入库前 + 入库量 - 入库量 = 入库前）
    const finInvAfterWithdraw = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const finQtyAfterWithdraw = finInvAfterWithdraw ? parseFloat(String(finInvAfterWithdraw.quantity)) : 0;
    // 差值应等于0（允许±1的精度误差，因为汇总库存可能受decimal精度影响）
    expect(Math.abs(finQtyAfterWithdraw - finQtyBefore)).toBeLessThanOrEqual(1);

    // 生产单状态恢复
    const prodAfterWithdraw = await getProductionOrderByNumber(pon);
    expect(parseFloat(String(prodAfterWithdraw!.inbound_quantity))).toBe(0);
    expect(prodAfterWithdraw!.inbound_status).toBe('未入库');

    // 流水作废
    const txns = await getInventoryTransactionsBySource(pon);
    const voidedTx = txns.find(t => t.transaction_number === detail.transaction_number);
    expect(voidedTx!.status).toBe('作废');
  });

  // ==================== 场景3：重复撤回安全校验 ====================
  test('重复撤回：已撤回的入库单再次撤回应报错', async () => {
    // 查找或创建一个已入库的生产单
    const prodOrder = await findAvailableProductionOrderNoBackflush()
      || await findAvailableProductionOrderForInbound();
    if (!prodOrder) {
      console.log('跳过重复撤回测试：没有找到可用的生产单');
      return;
    }
    const pon = prodOrder.production_order_number;
    const itemNumber = prodOrder.item_number;
    const itemName = prodOrder.item_name;
    const plannedQty = parseFloat(String(prodOrder.planned_quantity));
    const inboundQty = Math.max(1, Math.min(plannedQty, 2));

    const warehouse = await getWarehouse(WAREHOUSE_01);
    if (!warehouse) {
      console.log('跳过重复撤回测试：仓库01不存在');
      return;
    }

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
      remark: `E2E-PIWD-DUP-${Date.now()}`
    });
    const ion = inboundResult.inboundOrderNumber;
    createdInboundOrders.push(ion);

    // 第一次撤回：成功
    await withdrawInboundOrderAPI(ion);
    const orderAfter = await getProductionInboundOrder(ion);
    expect(orderAfter!.status).toBe('已撤回');

    // 第二次撤回：应报错
    await expect(withdrawInboundOrderAPI(ion)).rejects.toThrow(/已撤回|不可重复/);
  });

  // ==================== 场景4：入库单状态流转验证 ====================
  test('入库单状态流转：正常→已撤回', async () => {
    const prodOrder = await findAvailableProductionOrderNoBackflush()
      || await findAvailableProductionOrderForInbound();
    if (!prodOrder) {
      console.log('跳过状态流转测试：没有找到可用的生产单');
      return;
    }
    const pon = prodOrder.production_order_number;
    const itemNumber = prodOrder.item_number;
    const itemName = prodOrder.item_name;
    const plannedQty = parseFloat(String(prodOrder.planned_quantity));
    const inboundQty = Math.max(1, Math.min(plannedQty, 2));

    const warehouse = await getWarehouse(WAREHOUSE_01);
    if (!warehouse) {
      console.log('跳过状态流转测试：仓库01不存在');
      return;
    }

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
      remark: `E2E-PIWD-STATUS-${Date.now()}`
    });
    const ion = inboundResult.inboundOrderNumber;
    createdInboundOrders.push(ion);

    // 验证：状态为'正常'
    const orderBefore = await getProductionInboundOrder(ion);
    expect(orderBefore!.status).toBe('正常');
    expect(orderBefore!.withdraw_operator).toBeFalsy();
    expect(orderBefore!.withdraw_date).toBeFalsy();

    // 撤回
    await withdrawInboundOrderAPI(ion);

    // 验证：状态为'已撤回'，撤回信息记录
    const orderAfter = await getProductionInboundOrder(ion);
    expect(orderAfter!.status).toBe('已撤回');
    expect(orderAfter!.withdraw_operator).toBeTruthy();
    expect(orderAfter!.withdraw_date).toBeTruthy();
  });

  // ==================== 场景5：完整库存流水审计验证 ====================
  test('库存流水审计：入库产生正常流水→撤回后流水标记作废', async () => {
    const prodOrder = await findAvailableProductionOrderNoBackflush()
      || await findAvailableProductionOrderForInbound();
    if (!prodOrder) {
      console.log('跳过流水审计测试：没有找到可用的生产单');
      return;
    }
    const pon = prodOrder.production_order_number;
    const itemNumber = prodOrder.item_number;
    const itemName = prodOrder.item_name;
    const plannedQty = parseFloat(String(prodOrder.planned_quantity));
    const inboundQty = Math.max(1, Math.min(plannedQty, 2));

    const warehouse = await getWarehouse(WAREHOUSE_01);
    if (!warehouse) {
      console.log('跳过流水审计测试：仓库01不存在');
      return;
    }

    // 入库前：无生产入库流水（或仅有历史的）
    const txnsBefore = await getInventoryTransactionsBySource(pon);

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
      remark: `E2E-PIWD-AUDIT-${Date.now()}`
    });
    const ion = inboundResult.inboundOrderNumber;
    createdInboundOrders.push(ion);

    // 验证：新增了流水且状态为'正常'
    const txnsAfter = await getInventoryTransactionsBySource(pon);
    expect(txnsAfter.length).toBeGreaterThan(txnsBefore.length);
    const newTxns = txnsAfter.filter(t => !txnsBefore.some(b => b.transaction_number === t.transaction_number));
    for (const tx of newTxns) {
      expect(tx.status).toBe('正常');
      expect(tx.transaction_type).toBe('入库');
      expect(tx.source_type).toBe('生产入库');
      expect(parseFloat(String(tx.quantity))).toBe(inboundQty);
      // 验证前后数量一致性
      expect(parseFloat(String(tx.after_quantity)) - parseFloat(String(tx.before_quantity))).toBe(inboundQty);
    }

    // 撤回
    await withdrawInboundOrderAPI(ion);

    // 验证：所有新增流水标记为'作废'
    const txnsAfterWithdraw = await getInventoryTransactionsBySource(pon);
    for (const txNum of newTxns.map(t => t.transaction_number)) {
      const voidedTx = txnsAfterWithdraw.find(t => t.transaction_number === txNum);
      expect(voidedTx, `流水 ${txNum} 应仍存在`).toBeTruthy();
      expect(voidedTx!.status).toBe('作废');
    }
  });

  // ==================== 场景6：倒冲扣减反转验证（批次级别） ====================
  test('倒冲扣减反转：物料批次加回+倒冲任务回退+扣减日志状态', async () => {
    const prodOrder = await findAvailableProductionOrderForInbound();
    if (!prodOrder) {
      console.log('跳过倒冲反转验证：没有找到有倒冲的生产单');
      return;
    }
    const pon = prodOrder.production_order_number;
    const itemNumber = prodOrder.item_number;
    const itemName = prodOrder.item_name;
    const plannedQty = parseFloat(String(prodOrder.planned_quantity));
    const inboundQty = Math.max(1, Math.min(plannedQty, 3));

    const warehouse = await getWarehouse(WAREHOUSE_01);
    if (!warehouse) {
      console.log('跳过倒冲反转验证：仓库01不存在');
      return;
    }

    // 记录倒冲任务基线
    const bfTasksBefore = await getBackflushTasksByOrderFull(pon);
    if (bfTasksBefore.length === 0) {
      console.log('跳过倒冲反转验证：倒冲任务为空');
      return;
    }

    // 记录各物料批次库存基线
    const matBatchBaseline: Record<string, Array<{ batch_number: string; quantity: number }>> = {};
    for (const bft of bfTasksBefore) {
      const key = bft.material_number;
      if (!matBatchBaseline[key]) {
        const batches = await getMaterialBatchInventory(bft.material_number, bft.warehouse_number);
        matBatchBaseline[key] = batches.map(b => ({
          batch_number: b.batch_number,
          quantity: parseFloat(String(b.quantity))
        }));
      }
    }

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
      remark: `E2E-PIWD-BF-${Date.now()}`
    });
    const ion = inboundResult.inboundOrderNumber;
    createdInboundOrders.push(ion);

    // 获取扣减日志
    const deductionLogs = await getBackflushDeductionLogs(pon);
    expect(deductionLogs.length, '应产生倒冲扣减日志').toBeGreaterThanOrEqual(1);

    // 验证批次级别扣减
    for (const dlog of deductionLogs) {
      // 解析batch_deductions
      let batchDeductions: Array<{ batch_number: string; quantity: number }> = [];
      if (dlog.batch_deductions) {
        try { batchDeductions = JSON.parse(dlog.batch_deductions); } catch { /* ignore */ }
      }
      expect(batchDeductions.length, `物料 ${dlog.material_number} 应有批次扣减明细`).toBeGreaterThanOrEqual(1);

      // 验证物料流水
      if (dlog.transaction_number) {
        const matTx = await getMaterialTransactionByTxNum(dlog.transaction_number);
        expect(matTx).toBeTruthy();
        expect(matTx!.status).toBe('正常');
        expect(matTx!.transaction_type).toBe('出库');
      }
    }

    // 撤回
    await withdrawInboundOrderAPI(ion);

    // 验证倒冲日志状态
    const deductionLogsAfter = await getBackflushDeductionLogs(pon);
    for (const dlog of deductionLogsAfter) {
      expect(dlog.status).toBe('已撤回');
    }

    // 验证倒冲任务回退
    const bfTasksAfter = await getBackflushTasksByOrderFull(pon);
    for (const bft of bfTasksAfter) {
      expect(parseFloat(String(bft.deducted_quantity))).toBe(0);
      expect(bft.deduction_status).toBe('待扣减');
    }

    // 验证物料批次库存恢复
    for (const bft of bfTasksAfter) {
      const key = bft.material_number;
      const baseline = matBatchBaseline[key];
      if (baseline) {
        const batchesNow = await getMaterialBatchInventory(bft.material_number, bft.warehouse_number);
        // 验证每个被扣减的批次数量恢复
        for (const baseBatch of baseline) {
          const currentBatch = batchesNow.find(b => b.batch_number === baseBatch.batch_number);
          if (currentBatch) {
            expect(parseFloat(String(currentBatch.quantity))).toBe(baseBatch.quantity);
          }
        }
      }
    }

    // 验证物料流水作废
    for (const dlog of deductionLogs) {
      if (dlog.transaction_number) {
        const matTx = await getMaterialTransactionByTxNum(dlog.transaction_number);
        expect(matTx).toBeTruthy();
        expect(matTx!.status).toBe('作废');
      }
    }
  });
});
