/**
 * E2E测试：生产完工自动入库
 *
 * 测试策略：API驱动 + 数据库断言
 * 覆盖场景：
 *   1. 成品类型生产单：最后一道工序报工→自动生成成品仓生产入库单
 *   2. 非成品类型生产单：最后一道工序报工→自动生成原料仓半成品生产入库单
 *
 * 验证项：
 *   - 入库单存在（成品/半成品对应表）
 *   - 入库数量 = 末道工序正品数
 *   - 生产单入库状态更新（inbound_status, inbound_quantity）
 *   - 成品：成品批次库存 + 成品汇总库存
 *   - 非成品：物料批次库存 + 物料汇总库存
 */
import { test, expect } from '@playwright/test';
import {
  completeOrderReportAPI, disposeApiContext
} from '../helpers/api.helper';
import {
  findFinishedProductOrderForAutoInbound, findNonFinishedProductOrderForAutoInbound,
  getProductionInboundOrderDetailsByOrder, getSemiProductionInboundOrderDetailsByOrder,
  getProductionInboundOrderByNumber, getSemiProductionInboundOrderByNumber,
  getProductionOrderByNumber, getFinishedGoodsInventory,
  getFinishedBatchInventory, getMaterialInventoryRecord,
  getMaterialBatchInventory
} from '../helpers/db.helper';

test.describe('生产完工自动入库', () => {

  test.afterAll(async () => {
    await disposeApiContext();
  });

  // ==================== 场景1：成品类型 → 自动生成成品仓入库单 ====================
  test('成品生产单：完成报工→自动生成成品仓生产入库单', async () => {
    test.setTimeout(120_000);
    const prodOrder = await findFinishedProductOrderForAutoInbound();
    if (!prodOrder) {
      console.log('跳过成品自动入库测试：没有找到符合条件的成品生产单');
      return;
    }

    const pon = prodOrder.production_order_number;
    const itemNumber = prodOrder.item_number;
    const plannedQty = parseFloat(String(prodOrder.planned_quantity));
    const qualifiedQty = Math.max(1, Math.min(plannedQty, 5)); // 报工1~5件

    console.log(`[成品自动入库] 生产单 ${pon}, 物料 ${itemNumber}(${prodOrder.item_type}), 报工正品 ${qualifiedQty}`);

    // ---------- 执行完成报工 ----------
    const result = await completeOrderReportAPI({
      production_order_number: pon,
      qualified_quantity: qualifiedQty,
    });

    console.log(`[成品自动入库] 报工结果:`, JSON.stringify(result));

    // 等待自动入库完成（afterCommit 异步执行，需等待）
    await new Promise(r => setTimeout(r, 3000));

    // ---------- 验证1：生产单状态变为"已完成" ----------
    const orderAfter = await getProductionOrderByNumber(pon);
    expect(orderAfter, '生产单应存在').toBeTruthy();
    expect(orderAfter!.plan_status, '生产单状态应为已完成').toBe('已完成');

    // ---------- 验证2：成品入库单明细存在 ----------
    const inboundDetails = await getProductionInboundOrderDetailsByOrder(pon);
    expect(inboundDetails.length, '应有成品入库单明细行').toBeGreaterThanOrEqual(1);

    const inboundDetail = inboundDetails[0];
    expect(inboundDetail.item_number, '入库物料编号应匹配').toBe(itemNumber);
    expect(parseFloat(String(inboundDetail.inbound_quantity)), '入库数量应等于报工正品数').toBe(qualifiedQty);

    // ---------- 验证3：生产单入库状态更新 ----------
    expect(orderAfter!.inbound_status, '入库状态应为全部入库').toBe('全部入库');
    expect(parseFloat(String(orderAfter!.inbound_quantity)), '已入库数量应等于正品数').toBe(qualifiedQty);

    // ---------- 验证4：成品入库单主表存在 ----------
    const ion = inboundDetail.inbound_order_number;
    const inboundOrder = await getProductionInboundOrderByNumber(ion);
    expect(inboundOrder, '成品入库单主表应存在').toBeTruthy();

    // ---------- 验证5：成品批次库存 ----------
    const batchInv = await getFinishedBatchInventory(itemNumber, inboundOrder!.warehouse_number);
    // 找到该生产单的批次
    const orderBatch = batchInv.find(b => b.production_order_number === pon);
    expect(orderBatch, '应有该生产单的成品批次库存').toBeTruthy();
    expect(parseFloat(String(orderBatch!.quantity)), '批次库存数量应等于正品数').toBe(qualifiedQty);

    // ---------- 验证6：成品汇总库存 ----------
    const finInv = await getFinishedGoodsInventory(itemNumber, inboundOrder!.warehouse_number);
    expect(finInv, '成品汇总库存应存在').toBeTruthy();
    expect(parseFloat(String(finInv!.quantity)), '成品汇总库存应包含正品数').toBeGreaterThanOrEqual(qualifiedQty);

    console.log(`[成品自动入库] 验证完成: 入库单号 ${ion}, 入库数量 ${inboundDetail.inbound_quantity}`);
  });

  // ==================== 场景2：非成品类型 → 自动生成原料仓半成品入库单 ====================
  test('非成品生产单：完成报工→自动生成原料仓半成品生产入库单', async () => {
    test.setTimeout(120_000);
    const prodOrder = await findNonFinishedProductOrderForAutoInbound();
    if (!prodOrder) {
      console.log('跳过非成品自动入库测试：没有找到符合条件的非成品生产单');
      return;
    }

    const pon = prodOrder.production_order_number;
    const itemNumber = prodOrder.item_number;
    const plannedQty = parseFloat(String(prodOrder.planned_quantity));
    const qualifiedQty = Math.max(1, Math.min(plannedQty, 5)); // 报工1~5件

    console.log(`[非成品自动入库] 生产单 ${pon}, 物料 ${itemNumber}(${prodOrder.item_type}), 报工正品 ${qualifiedQty}`);

    // ---------- 执行完成报工 ----------
    const result = await completeOrderReportAPI({
      production_order_number: pon,
      qualified_quantity: qualifiedQty,
    });

    console.log(`[非成品自动入库] 报工结果:`, JSON.stringify(result));

    // 等待自动入库完成（afterCommit 异步执行，需等待）
    await new Promise(r => setTimeout(r, 3000));

    // ---------- 验证1：生产单状态变为"已完成" ----------
    const orderAfter = await getProductionOrderByNumber(pon);
    expect(orderAfter, '生产单应存在').toBeTruthy();
    expect(orderAfter!.plan_status, '生产单状态应为已完成').toBe('已完成');

    // ---------- 验证2：半成品入库单明细存在 ----------
    const inboundDetails = await getSemiProductionInboundOrderDetailsByOrder(pon);
    expect(inboundDetails.length, '应有半成品入库单明细行').toBeGreaterThanOrEqual(1);

    const inboundDetail = inboundDetails[0];
    expect(inboundDetail.item_number, '入库物料编号应匹配').toBe(itemNumber);
    expect(parseFloat(String(inboundDetail.inbound_quantity)), '入库数量应等于报工正品数').toBe(qualifiedQty);

    // ---------- 验证3：生产单入库状态更新 ----------
    expect(orderAfter!.inbound_status, '入库状态应为全部入库').toBe('全部入库');
    expect(parseFloat(String(orderAfter!.inbound_quantity)), '已入库数量应等于正品数').toBe(qualifiedQty);

    // ---------- 验证4：半成品入库单主表存在 ----------
    const ion = inboundDetail.inbound_order_number;
    const inboundOrder = await getSemiProductionInboundOrderByNumber(ion);
    expect(inboundOrder, '半成品入库单主表应存在').toBeTruthy();

    // ---------- 验证5：物料批次库存 ----------
    const matBatch = await getMaterialBatchInventory(itemNumber, inboundOrder!.warehouse_number);
    // 找到该生产单的批次
    const orderBatch = matBatch.find(b => b.production_order_number === pon);
    expect(orderBatch, '应有该生产单的物料批次库存').toBeTruthy();
    expect(parseFloat(String(orderBatch!.quantity)), '批次库存数量应等于正品数').toBe(qualifiedQty);

    // ---------- 验证6：物料汇总库存 ----------
    const matInv = await getMaterialInventoryRecord(itemNumber, inboundOrder!.warehouse_number);
    expect(matInv, '物料汇总库存应存在').toBeTruthy();
    expect(parseFloat(String(matInv!.quantity)), '物料汇总库存应包含正品数').toBeGreaterThanOrEqual(qualifiedQty);

    console.log(`[非成品自动入库] 验证完成: 入库单号 ${ion}, 入库数量 ${inboundDetail.inbound_quantity}`);
  });
});