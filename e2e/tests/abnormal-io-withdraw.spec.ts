/**
 * E2E测试：其他出入库操作 + 撤消确认 + 库存数据一致性验证
 *
 * 测试策略：API驱动 + 数据库断言
 * 覆盖场景：
 *   1. 退货入库：创建→确认→验证库存增加→撤消→验证库存恢复
 *   2. 报废出库：创建→确认→验证库存减少→撤消→验证库存恢复
 *   3. 调拨出入库：创建→确认→验证源仓减少+目标仓增加→撤消→验证双仓恢复
 *   4. 盘盈盘亏：创建→确认→验证调整→撤消→验证恢复
 *   5. 状态流转：待确认→已确认→已撤消 的完整状态机验证
 *   6. 库存流水审计：确认产生正常流水→撤消后流水标记作废
 */
import { test, expect } from '@playwright/test';
import {
  createAbnormalIOAPI, confirmAbnormalIOAPI, withdrawAbnormalIOAPI,
  deleteAbnormalIOAPI, rejectAbnormalIOAPI, disposeApiContext
} from '../helpers/api.helper';
import {
  getAbnormalIORequest, getAbnormalIOTransactions,
  getFinishedGoodsInventory, getFinishedBatchInventory,
  cleanupAbnormalIOData, findFinishedItemWithBatches,
  findAnotherWarehouseWithInventory
} from '../helpers/db.helper';

const TEST_MARKER = `E2E-ABIO-${Date.now()}`;
const WAREHOUSE_01 = '01';

// 记录测试中创建的单号，用于清理
const createdRequests: string[] = [];

test.describe('其他出入库操作与撤消', () => {

  test.afterAll(async () => {
    // 清理所有测试数据
    for (const rn of createdRequests) {
      try { await cleanupAbnormalIOData(rn); } catch { /* ignore */ }
    }
    await disposeApiContext();
  });

  // ==================== 场景1：退货入库 + 撤消 ====================
  test('退货入库：创建→确认→验证库存增加→撤消→验证库存恢复', async () => {
    // 查找测试物料
    const item = await findFinishedItemWithBatches(WAREHOUSE_01);
    expect(item, '需要至少一个有库存的物料才能测试退货入库').toBeTruthy();
    const itemNumber = item!.item_number;
    const itemName = item!.item_name;

    // 记录确认前库存
    const invBefore = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const qtyBefore = invBefore ? parseFloat(String(invBefore.quantity)) : 0;

    // 创建退货入库申请
    const createResult = await createAbnormalIOAPI({
      type: '退货入库',
      warehouse_number: WAREHOUSE_01,
      warehouse_name: '成品仓库',
      reason: `${TEST_MARKER}-退货入库`,
      details: [{ item_number: itemNumber, item_name: itemName, quantity: 3, unit: '个' }]
    });
    const rn = createResult.request_number;
    createdRequests.push(rn);

    // 验证：状态为待确认
    const reqAfterCreate = await getAbnormalIORequest(rn);
    expect(reqAfterCreate!.status).toBe('待确认');
    expect(reqAfterCreate!.type).toBe('退货入库');

    // 确认
    await confirmAbnormalIOAPI(rn);

    // 验证：状态变为已确认
    const reqAfterConfirm = await getAbnormalIORequest(rn);
    expect(reqAfterConfirm!.status).toBe('已确认');

    // 验证：库存增加了3
    const invAfterConfirm = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const qtyAfterConfirm = invAfterConfirm ? parseFloat(String(invAfterConfirm.quantity)) : 0;
    expect(qtyAfterConfirm).toBe(qtyBefore + 3);

    // 验证：产生了入库流水（仅正常状态）
    const txAfterConfirm = await getAbnormalIOTransactions(rn);
    expect(txAfterConfirm.length).toBeGreaterThanOrEqual(1);
    const inTx = txAfterConfirm.find(t => t.source_type === '退货入库' && t.status === '正常');
    expect(inTx).toBeTruthy();
    expect(inTx!.transaction_type).toBe('入库');
    expect(parseFloat(String(inTx!.quantity))).toBe(3);

    // 撤消
    await withdrawAbnormalIOAPI(rn);

    // 验证：状态变为已撤消
    const reqAfterWithdraw = await getAbnormalIORequest(rn);
    expect(reqAfterWithdraw!.status).toBe('已撤消');

    // 验证：库存恢复到确认前
    const invAfterWithdraw = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const qtyAfterWithdraw = invAfterWithdraw ? parseFloat(String(invAfterWithdraw.quantity)) : 0;
    expect(qtyAfterWithdraw).toBe(qtyBefore);

    // 验证：流水被标记为作废
    const txAfterWithdraw = await getAbnormalIOTransactions(rn);
    const voidedTx = txAfterWithdraw.find(t => t.source_type === '退货入库');
    expect(voidedTx!.status).toBe('作废');
  });

  // ==================== 场景2：报废出库 + 撤消 ====================
  test('报废出库：创建→确认→验证库存减少→撤消→验证库存恢复', async () => {
    const item = await findFinishedItemWithBatches(WAREHOUSE_01);
    expect(item, '需要至少一个有批次库存的物料才能测试报废出库').toBeTruthy();
    const itemNumber = item!.item_number;
    const itemName = item!.item_name;

    // 记录确认前库存
    const invBefore = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const qtyBefore = invBefore ? parseFloat(String(invBefore.quantity)) : 0;

    const createResult = await createAbnormalIOAPI({
      type: '报废出库',
      warehouse_number: WAREHOUSE_01,
      warehouse_name: '成品仓库',
      reason: `${TEST_MARKER}-报废出库`,
      details: [{ item_number: itemNumber, item_name: itemName, quantity: 2, unit: '个' }]
    });
    const rn = createResult.request_number;
    createdRequests.push(rn);

    // 确认
    await confirmAbnormalIOAPI(rn);

    // 验证：状态已确认，库存减少
    const reqAfterConfirm = await getAbnormalIORequest(rn);
    expect(reqAfterConfirm!.status).toBe('已确认');
    const invAfterConfirm = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const qtyAfterConfirm = invAfterConfirm ? parseFloat(String(invAfterConfirm.quantity)) : 0;
    expect(qtyAfterConfirm).toBe(qtyBefore - 2);

    // 验证：产生了出库流水
    const txAfterConfirm = await getAbnormalIOTransactions(rn);
    const outTx = txAfterConfirm.find(t => t.source_type === '报废出库');
    expect(outTx).toBeTruthy();
    expect(outTx!.transaction_type).toBe('出库');
    expect(outTx!.status).toBe('正常');

    // 撤消
    await withdrawAbnormalIOAPI(rn);

    // 验证：库存恢复
    const invAfterWithdraw = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const qtyAfterWithdraw = invAfterWithdraw ? parseFloat(String(invAfterWithdraw.quantity)) : 0;
    expect(qtyAfterWithdraw).toBe(qtyBefore);

    // 验证：流水作废
    const txAfterWithdraw = await getAbnormalIOTransactions(rn);
    const voidedTx = txAfterWithdraw.find(t => t.source_type === '报废出库');
    expect(voidedTx!.status).toBe('作废');
  });

  // ==================== 场景3：盘盈盘亏 + 撤消 ====================
  test('盘盈盘亏：创建→确认→验证盘盈调整→撤消→验证库存恢复', async () => {
    const item = await findFinishedItemWithBatches(WAREHOUSE_01);
    expect(item, '需要至少一个有库存的物料才能测试盘盈盘亏').toBeTruthy();
    const itemNumber = item!.item_number;
    const itemName = item!.item_name;

    const invBefore = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const qtyBefore = invBefore ? parseFloat(String(invBefore.quantity)) : 0;

    // 盘盈：实盘>系统，差异=+3
    const createResult = await createAbnormalIOAPI({
      type: '盘盈盘亏',
      warehouse_number: WAREHOUSE_01,
      warehouse_name: '成品仓库',
      reason: `${TEST_MARKER}-盘盈调整`,
      details: [{
        item_number: itemNumber, item_name: itemName,
        system_quantity: qtyBefore, actual_quantity: qtyBefore + 3,
        difference_quantity: 3, unit: '个'
      }]
    });
    const rn = createResult.request_number;
    createdRequests.push(rn);

    // 确认
    await confirmAbnormalIOAPI(rn);

    // 验证：库存增加3（盘盈）
    const invAfterConfirm = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const qtyAfterConfirm = invAfterConfirm ? parseFloat(String(invAfterConfirm.quantity)) : 0;
    expect(qtyAfterConfirm).toBe(qtyBefore + 3);

    // 验证：产生了盘盈调整流水
    const txAfterConfirm = await getAbnormalIOTransactions(rn);
    const surplusTx = txAfterConfirm.find(t => t.source_type === '盘盈调整');
    expect(surplusTx).toBeTruthy();
    expect(surplusTx!.transaction_type).toBe('入库');

    // 撤消
    await withdrawAbnormalIOAPI(rn);

    // 验证：库存恢复
    const invAfterWithdraw = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const qtyAfterWithdraw = invAfterWithdraw ? parseFloat(String(invAfterWithdraw.quantity)) : 0;
    expect(qtyAfterWithdraw).toBe(qtyBefore);

    // 验证：流水作废
    const txAfterWithdraw = await getAbnormalIOTransactions(rn);
    expect(txAfterWithdraw.every(t => t.status === '作废')).toBeTruthy();
  });

  // ==================== 场景4：调拨出入库 + 撤消 ====================
  test('调拨出入库：创建→确认→验证双仓变化→撤消→验证双仓恢复', async () => {
    const item = await findFinishedItemWithBatches(WAREHOUSE_01);
    expect(item, '需要至少一个有批次库存的物料才能测试调拨').toBeTruthy();
    const itemNumber = item!.item_number;
    const itemName = item!.item_name;

    // 查找目标仓库
    const targetWh = await findAnotherWarehouseWithInventory(WAREHOUSE_01);
    if (!targetWh) {
      console.log('跳过调拨测试：没有找到第二个有库存的仓库');
      return;
    }

    // 记录两个仓库确认前库存
    const srcInvBefore = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    const srcQtyBefore = srcInvBefore ? parseFloat(String(srcInvBefore.quantity)) : 0;
    const tgtInvBefore = await getFinishedGoodsInventory(itemNumber, targetWh.warehouse_number);
    const tgtQtyBefore = tgtInvBefore ? parseFloat(String(tgtInvBefore.quantity)) : 0;

    const createResult = await createAbnormalIOAPI({
      type: '调拨出入库',
      warehouse_number: WAREHOUSE_01,
      warehouse_name: '成品仓库',
      target_warehouse_number: targetWh.warehouse_number,
      target_warehouse_name: targetWh.warehouse_name,
      reason: `${TEST_MARKER}-调拨`,
      details: [{ item_number: itemNumber, item_name: itemName, quantity: 1, unit: '个' }]
    });
    const rn = createResult.request_number;
    createdRequests.push(rn);

    // 确认
    await confirmAbnormalIOAPI(rn);

    // 验证：源仓库减少，目标仓库增加
    const srcInvAfter = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    expect(parseFloat(String(srcInvAfter!.quantity))).toBe(srcQtyBefore - 1);
    const tgtInvAfter = await getFinishedGoodsInventory(itemNumber, targetWh.warehouse_number);
    expect(parseFloat(String(tgtInvAfter!.quantity))).toBe(tgtQtyBefore + 1);

    // 验证：产生了调拨出库+调拨入库两条流水
    const txAfterConfirm = await getAbnormalIOTransactions(rn);
    const outTx = txAfterConfirm.find(t => t.source_type === '调拨出库');
    const inTx = txAfterConfirm.find(t => t.source_type === '调拨入库');
    expect(outTx).toBeTruthy();
    expect(inTx).toBeTruthy();

    // 撤消
    await withdrawAbnormalIOAPI(rn);

    // 验证：两个仓库库存恢复
    const srcInvFinal = await getFinishedGoodsInventory(itemNumber, WAREHOUSE_01);
    expect(parseFloat(String(srcInvFinal!.quantity))).toBe(srcQtyBefore);
    const tgtInvFinal = await getFinishedGoodsInventory(itemNumber, targetWh.warehouse_number);
    expect(parseFloat(String(tgtInvFinal!.quantity))).toBe(tgtQtyBefore);

    // 验证：所有流水作废
    const txAfterWithdraw = await getAbnormalIOTransactions(rn);
    expect(txAfterWithdraw.every(t => t.status === '作废')).toBeTruthy();
  });

  // ==================== 场景5：状态流转 + 驳回 ====================
  test('状态流转：待确认→驳回→编辑重新提交→确认→撤消→删除', async () => {
    const item = await findFinishedItemWithBatches(WAREHOUSE_01);
    expect(item, '需要至少一个有库存的物料才能测试状态流转').toBeTruthy();

    // 创建
    const createResult = await createAbnormalIOAPI({
      type: '退货入库',
      warehouse_number: WAREHOUSE_01,
      warehouse_name: '成品仓库',
      reason: `${TEST_MARKER}-状态流转`,
      details: [{ item_number: item!.item_number, item_name: item!.item_name, quantity: 1, unit: '个' }]
    });
    const rn = createResult.request_number;
    createdRequests.push(rn);

    // 验证：待确认
    let req = await getAbnormalIORequest(rn);
    expect(req!.status).toBe('待确认');

    // 驳回
    await rejectAbnormalIOAPI(rn);
    req = await getAbnormalIORequest(rn);
    expect(req!.status).toBe('已驳回');

    // 确认（已驳回状态不能确认，应报错）
    await expect(confirmAbnormalIOAPI(rn)).rejects.toThrow();

    // 重新创建一个待确认的申请（已驳回的可以编辑，但API不支持直接改状态，这里创建新的）
    const createResult2 = await createAbnormalIOAPI({
      type: '退货入库',
      warehouse_number: WAREHOUSE_01,
      warehouse_name: '成品仓库',
      reason: `${TEST_MARKER}-状态流转2`,
      details: [{ item_number: item!.item_number, item_name: item!.item_name, quantity: 1, unit: '个' }]
    });
    const rn2 = createResult2.request_number;
    createdRequests.push(rn2);

    // 确认
    await confirmAbnormalIOAPI(rn2);
    req = await getAbnormalIORequest(rn2);
    expect(req!.status).toBe('已确认');

    // 撤消
    await withdrawAbnormalIOAPI(rn2);
    req = await getAbnormalIORequest(rn2);
    expect(req!.status).toBe('已撤消');

    // 删除已撤消的记录
    await deleteAbnormalIOAPI(rn2);
    req = await getAbnormalIORequest(rn2);
    expect(req).toBeNull();

    // 已撤消记录的流水仍然存在（审计保留）
    const tx = await getAbnormalIOTransactions(rn2);
    expect(tx.length).toBeGreaterThanOrEqual(1);
    expect(tx.every(t => t.status === '作废')).toBeTruthy();
  });
});
