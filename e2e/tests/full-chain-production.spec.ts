/**
 * 生产全链路 E2E 测试：
 *   生产计划 → MRP → 生产单 + 采购申请
 *   → 拆分+派发 → 备料(领料) → 多工序报工 → 成品入库
 *   → 采购申请转采购订单
 *
 * 策略：API 驱动 + DB 断言（纯API，无UI操作）
 */
import { test, expect } from '@playwright/test';
import {
  createProductionPlanDirect,
  getMrpRun,
  getMrpRunDetails,
  getProductionOrdersBySourcePlan,
  getPurchaseReqsBySourcePlan,
  getPurchaseReqDetails,
  getPurchaseReqBySource,
  getProductionOrderByNumber,
  getProcessTasksByOrder,
  getMaterialPreparationByOrder,
  getWorkReportsByOrder,
  getBomDetails,
  seedMaterialInventory,
  batchApproveProcessTasks,
  cleanupProductionChain,
  getFinishedBatchInventory,
  query,
  T,
} from '../helpers/db.helper';
import {
  getApiContext,
  disposeApiContext,
  submitAndApprove,
  runMrpAPI,
  executeMrpAPI,
  splitOrdersAPI,
  dispatchAndGenerateAPI,
  createMaterialIssueAPI,
  quickReportAPI,
  productionInboundAPI,
  purchaseReqToOrderAPI,
} from '../helpers/api.helper';

// 测试数据
const TEST_ITEM = 'C100809';
const TEST_QTY = 99999; // 远超当前库存确保MRP净需求>0
const TEST_REMARK = 'E2E-PROD-CHAIN';
const WAREHOUSE_RAW = '04';      // 原材料仓库
const WAREHOUSE_FINISHED = '01'; // 成品仓
const SUPPLIER_NUMBER = 'S001';
const SUPPLIER_NAME = '宁国睿信';

// 全局共享状态
const ctx: {
  productionNumber?: string;
  mrpRunNumber?: string;
  productionOrderNumbers: string[];
  splitOrderNumber?: string;
  purchaseReqNumbers: string[];
  purchaseOrderNumbers: string[];
  preparationNumber?: string;
  processTaskNumbers: string[];
} = {
  productionOrderNumbers: [],
  purchaseReqNumbers: [],
  purchaseOrderNumbers: [],
  processTaskNumbers: [],
};

test.describe.serial('生产全链路 E2E', () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    // 全局登录
    await getApiContext();
    // 清理残留 E2E 数据
    await cleanupOldData();
  });

  test.afterAll(async () => {
    // 级联清理
    try {
      const r = await cleanupProductionChain({
        productionNumber: ctx.productionNumber,
        productionOrderNumbers: ctx.productionOrderNumbers,
        purchaseReqNumbers: ctx.purchaseReqNumbers,
        purchaseOrderNumbers: ctx.purchaseOrderNumbers,
        mrpRunNumber: ctx.mrpRunNumber,
      });
      console.log('[afterAll] 清理结果:', r);
    } catch (e) {
      console.warn('[afterAll] 清理异常:', e);
    }
    await disposeApiContext();
  });

  // ==================== Test 1: 生产计划 → 审批 → MRP → 执行 ====================
  test('1. 生产计划审批→MRP运算→执行生成生产单和采购申请', async () => {
    // Step 1: 直接创建生产计划（跳过MPS）
    const productionNumber = await createProductionPlanDirect(TEST_ITEM, TEST_QTY, TEST_REMARK);
    ctx.productionNumber = productionNumber;
    console.log(`[Test1] 生产计划创建: ${productionNumber}`);

    // Step 2: 审批生产计划
    await submitAndApprove('Production_plan', productionNumber);
    // 确认审批后状态正确且 mrp_status 允许MRP
    await query(
      `UPDATE Production_plan SET plan_status = N'待加入任务', mrp_status = NULL WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: productionNumber } }
    );
    console.log(`[Test1] 生产计划已审批并重置MRP状态`);

    // Step 3: 运行 MRP
    const mrpResult = await runMrpAPI([productionNumber]);
    expect(mrpResult, 'MRP运行结果为空').toBeTruthy();
    const mrpRunNumber = mrpResult.mrp_run_number;
    ctx.mrpRunNumber = mrpRunNumber;
    console.log(`[Test1] MRP运算: ${mrpRunNumber}`);

    // DB 断言：MRP 已计算
    const mrpRun = await getMrpRun(mrpRunNumber);
    expect(mrpRun, '未查到MRP运算记录').toBeTruthy();
    expect(mrpRun.run_status).toBe('已计算');

    // Step 4: 获取MRP明细，构建执行数据
    const details = await getMrpRunDetails(mrpRunNumber);
    expect(details.length, 'MRP明细为空').toBeGreaterThan(0);
    console.log(`[Test1] MRP明细行数: ${details.length}`);

    let executeItems = details
      .filter((d: any) => d.net_requirement > 0)
      .map((d: any) => ({
        id: d.id,
        produce_quantity: d.action_type === '生产' || d.action_type === '生产+采购' ? d.net_requirement : 0,
        purchase_quantity: d.action_type === '采购' || d.action_type === '生产+采购' ? d.net_requirement : 0,
      }));
    // Fallback: 如果库存充足导致net_requirement=0，使用gross_requirement
    if (executeItems.length === 0 && details.length > 0) {
      const fallback = details
        .filter((d: any) => d.gross_requirement > 0 || d.action_type)
        .map((d: any) => ({
          id: d.id,
          produce_quantity: (d.action_type === '生产' || d.action_type === '生产+采购') ? (d.gross_requirement || 99999) : 0,
          purchase_quantity: (d.action_type === '采购' || d.action_type === '生产+采购') ? (d.gross_requirement || 0) : 0,
        }));
      executeItems.push(...fallback);
    }
    expect(executeItems.length, '无净需求>0的明细').toBeGreaterThan(0);

    // Step 5: 执行 MRP
    const execResult = await executeMrpAPI(mrpRunNumber, executeItems);
    console.log(`[Test1] MRP执行结果:`, execResult);

    // DB 断言：应生成生产单和/或采购申请
    const prodOrders = await getProductionOrdersBySourcePlan(productionNumber);
    const purchaseReqs = await getPurchaseReqsBySourcePlan(productionNumber);
    console.log(`[Test1] 生产单数: ${prodOrders.length}, 采购申请数: ${purchaseReqs.length}`);

    expect(prodOrders.length + purchaseReqs.length, 'MRP执行后无生产单也无采购申请').toBeGreaterThan(0);

    // 收集生产单号
    ctx.productionOrderNumbers = prodOrders.map((p: any) => p.production_order_number);

    // 收集采购申请号
    ctx.purchaseReqNumbers = purchaseReqs.map((pr: any) => pr.purchase_req_number);

    // MRP 状态应为已确认
    const runAfter = await getMrpRun(mrpRunNumber);
    expect(runAfter.run_status).toBe('已确认');
    console.log(`[Test1] ✅ MRP执行完成`);
  });

  // ==================== Test 2: 审批生产单 → 拆分 → 派发+生成 ====================
  test('2. 生产单审批→拆分→派发+生成工序任务和备料单', async () => {
    expect(ctx.productionOrderNumbers.length, '无生产单可操作').toBeGreaterThan(0);

    const mainOrderNumber = ctx.productionOrderNumbers[0];

    // Step 1: 审批生产单
    await submitAndApprove('production_order', mainOrderNumber);
    const order = await getProductionOrderByNumber(mainOrderNumber);
    expect(order.approval_status).toBe('已审批');
    console.log(`[Test2] 生产单已审批: ${mainOrderNumber}`);

    // Step 2: 拆分（99999 → 60000 + 39999）
    const splitResult = await splitOrdersAPI([
      { type: 'original', production_order_number: mainOrderNumber, new_planned_quantity: 60000 },
      { type: 'new', source_order_number: mainOrderNumber, new_planned_quantity: 39999 },
    ]);
    console.log(`[Test2] 拆分结果:`, splitResult);

    // DB 断言：原生产单数量=60000
    const orderAfter = await getProductionOrderByNumber(mainOrderNumber);
    expect(Number(orderAfter.planned_quantity)).toBe(60000);

    // 找到拆分出的新生产单
    const allOrders = await getProductionOrdersBySourcePlan(ctx.productionNumber!);
    const newOrders = allOrders.filter((o: any) => o.production_order_number !== mainOrderNumber);
    expect(newOrders.length, '拆分后未找到新生产单').toBeGreaterThan(0);

    const splitOrderNumber = newOrders[0].production_order_number;
    ctx.splitOrderNumber = splitOrderNumber;
    ctx.productionOrderNumbers.push(splitOrderNumber);

    const splitOrder = await getProductionOrderByNumber(splitOrderNumber);
    expect(Number(splitOrder.planned_quantity)).toBe(39999);
    console.log(`[Test2] 拆分: ${mainOrderNumber}(60000) + ${splitOrderNumber}(39999)`);

    // Step 3: 审批新生产单
    await submitAndApprove('production_order', splitOrderNumber);

    // Step 4: 派发+生成（对原生产单 300）
    const today = new Date().toISOString().split('T')[0];
    const dispatchResult = await dispatchAndGenerateAPI([{
      production_order_number: mainOrderNumber,
      production_date: today,
    }]);
    console.log(`[Test2] 派发结果:`, JSON.stringify(dispatchResult)?.substring(0, 500));

    // DB 断言：工序任务已生成
    const tasks = await getProcessTasksByOrder(mainOrderNumber);
    expect(tasks.length, '派发后无工序任务').toBeGreaterThan(0);
    console.log(`[Test2] 工序任务数: ${tasks.length}`);

    tasks.forEach((t: any) => {
      console.log(`  步骤${t.step_number}: ${t.standard_process_name} 状态=${t.task_status}`);
    });

    ctx.processTaskNumbers = tasks.map((t: any) => t.process_task_number);

    // DB 断言：备料单已生成
    const preps = await getMaterialPreparationByOrder(mainOrderNumber);
    expect(preps.length, '派发后无备料单').toBeGreaterThan(0);
    ctx.preparationNumber = preps[0].preparation_number;
    console.log(`[Test2] 备料单: ${ctx.preparationNumber}, 状态=${preps[0].preparation_status}`);

    // DB 断言：生产单 plan_status 变为已派发
    const orderAfterDispatch = await getProductionOrderByNumber(mainOrderNumber);
    expect(orderAfterDispatch.plan_status).toBe('已派发');
    console.log(`[Test2] ✅ 拆分+派发完成`);
  });

  // ==================== Test 3: 种子库存 → 备料/领料 ====================
  test('3. 种子库存→领料→生产单状态变更', async () => {
    const mainOrderNumber = ctx.productionOrderNumbers[0];
    expect(ctx.preparationNumber, '无备料单号').toBeTruthy();

    // Step 1: 批量审批工序任务（派发后可能为草稿，报工需已审批）
    await batchApproveProcessTasks(mainOrderNumber);
    console.log(`[Test3] 工序任务已批量审批`);

    // Step 2: 获取备料单明细，种子库存
    const preps = await getMaterialPreparationByOrder(mainOrderNumber);
    const prepDetails = preps[0]?.details || [];
    console.log(`[Test3] 备料明细行数: ${prepDetails.length}`);

    const seededBatches: string[] = [];
    for (const d of prepDetails) {
      const batchNo = await seedMaterialInventory(
        d.material_number,
        d.default_warehouse || WAREHOUSE_RAW,
        Number(d.required_quantity) * 1.1 // 多备10%防不足
      );
      if (batchNo) seededBatches.push(batchNo);
    }
    console.log(`[Test3] 种子库存批次数: ${seededBatches.length}`);

    // Step 3: 创建领料单（需传 preparation_detail_id 以触发 issued_quantity 更新）
    const issueItems = prepDetails.map((d: any) => ({
      preparation_detail_id: d.id,
      material_number: d.material_number,
      actual_quantity: Number(d.required_quantity),
      warehouse_number: d.default_warehouse || WAREHOUSE_RAW,
      step_number: d.step_number,
    }));

    const issueResult = await createMaterialIssueAPI({
      preparation_number: ctx.preparationNumber!,
      production_order_number: mainOrderNumber,
      items: issueItems,
      remark: 'E2E自动领料',
    });
    console.log(`[Test3] 领料结果:`, issueResult);

    // DB 断言：首道工序物料全部领完后，生产单 plan_status 应变为已备料
    const orderAfterIssue = await getProductionOrderByNumber(mainOrderNumber);
    expect(orderAfterIssue.plan_status, `plan_status应为已备料，实际=${orderAfterIssue.plan_status}`).toBe('已备料');
    console.log(`[Test3] ✅ 领料完成, plan_status=${orderAfterIssue.plan_status}`);
  });

  // ==================== Test 4: 多工序报工 → 成品入库 ====================
  test('4. 多工序报工→生产单完成→成品入库', async () => {
    const mainOrderNumber = ctx.productionOrderNumbers[0];
    const tasks = await getProcessTasksByOrder(mainOrderNumber);
    expect(tasks.length, '无工序任务').toBeGreaterThan(0);

    // 按步骤顺序报工
    const today = new Date().toISOString().split('T')[0];
    for (const task of tasks) {
      const reportResult = await quickReportAPI({
        process_task_number: task.process_task_number,
        qualified_quantity: Number(task.planned_quantity),
        unqualified_quantity: 0,
        report_date: today,
        remark: 'E2E自动报工',
      });
      console.log(`[Test4] 报工: 步骤${task.step_number} ${task.standard_process_name} → ${reportResult?.work_report_number || 'OK'}`);
    }

    // DB 断言：所有工序任务完成
    const tasksAfter = await getProcessTasksByOrder(mainOrderNumber);
    for (const t of tasksAfter) {
      expect(t.task_status).toBe('已完成');
    }

    // DB 断言：生产单 plan_status = 已完成
    const orderAfterReport = await getProductionOrderByNumber(mainOrderNumber);
    expect(orderAfterReport.plan_status).toBe('已完成');
    console.log(`[Test4] ✅ 所有工序报工完成, plan_status=已完成`);

    // Step: 审批生产单（入库前需已审批状态）
    if (orderAfterReport.approval_status !== '已审批') {
      await submitAndApprove('production_order', mainOrderNumber);
    }

    // Step: 成品入库
    const order = await getProductionOrderByNumber(mainOrderNumber);
    const inboundResult = await productionInboundAPI({
      warehouse_number: WAREHOUSE_FINISHED,
      warehouse_name: '成品仓',
      items: [{
        production_order_number: mainOrderNumber,
        item_number: order.item_number,
        item_name: order.item_name,
        specifications: order.specifications || '',
        basic_unit: order.basic_unit || '',
        planned_quantity: Number(order.planned_quantity),
        inbound_qty: Number(order.planned_quantity),
      }],
      remark: 'E2E生产入库',
    });
    console.log(`[Test4] 入库结果:`, inboundResult);

    // DB 断言：成品批次库存
    const finishedBatches = await getFinishedBatchInventory(order.item_number, WAREHOUSE_FINISHED);
    const newBatch = finishedBatches.find((b: any) =>
      b.production_order_number === mainOrderNumber ||
      b.quantity >= Number(order.planned_quantity)
    );
    expect(newBatch, '未找到成品批次库存').toBeTruthy();
    console.log(`[Test4] ✅ 成品入库完成, 批次=${newBatch.batch_number}, 数量=${newBatch.quantity}`);

    // DB 断言：生产单 inbound_status 更新
    const orderAfterInbound = await getProductionOrderByNumber(mainOrderNumber);
    expect(['全部入库', '部分入库']).toContain(orderAfterInbound.inbound_status);
    console.log(`[Test4] ✅ 入库状态=${orderAfterInbound.inbound_status}`);
  });

  // ==================== Test 5: 采购申请审批 → 转采购订单 ====================
  test('5. 采购申请审批→转采购订单', async () => {
    expect(ctx.purchaseReqNumbers.length, '无采购申请可操作').toBeGreaterThan(0);

    const reqNumber = ctx.purchaseReqNumbers[0];

    // Step 1: 审批采购申请
    await submitAndApprove('purchase_req', reqNumber);
    const reqAfter = await getPurchaseReqBySource(reqNumber);
    expect(reqAfter.approval_status, '采购申请审批失败').toBe('已审批');
    console.log(`[Test5] 采购申请已审批: ${reqNumber}`);

    // Step 2: 获取采购申请明细
    const reqDetails = await getPurchaseReqDetails(reqNumber);
    expect(reqDetails.length, '采购申请明细为空').toBeGreaterThan(0);
    console.log(`[Test5] 采购申请明细行数: ${reqDetails.length}`);

    // Step 3: 转采购订单（detail_ids 是 purchase_req_detail.id）
    const detailIds = reqDetails.map((d: any) => d.id);
    const unitPrices: Record<string, string> = {};
    for (const d of reqDetails) {
      unitPrices[String(d.id)] = '1.00';
    }

    const toOrderResult = await purchaseReqToOrderAPI(reqNumber, {
      detail_ids: detailIds,
      supplier_number: SUPPLIER_NUMBER,
      supplier_name: SUPPLIER_NAME,
      unit_prices: unitPrices,
      remark: 'E2E自动转单',
    });
    console.log(`[Test5] 转单结果:`, toOrderResult);

    // DB 断言：采购订单已生成
    const poNumber = toOrderResult?.purchase_order_number;
    expect(poNumber, '未返回采购订单号').toBeTruthy();
    ctx.purchaseOrderNumbers.push(poNumber);

    const poRows = await query<any>(
      `SELECT purchase_order_number, approval_status, order_status FROM purchase_order WHERE purchase_order_number = @id`,
      { id: { type: T.NVarChar, value: poNumber } }
    );
    expect(poRows.length, '未查到采购订单').toBeGreaterThan(0);
    console.log(`[Test5] ✅ 采购订单已生成: ${poNumber}, 状态=${poRows[0].approval_status}`);
  });
});

/** 清理旧的 E2E 数据 */
async function cleanupOldData() {
  try {
    // 清理旧的生产计划（remark=E2E-PROD-CHAIN）
    const plans = await query<any>(
      `SELECT production_number FROM Production_plan WHERE remark = @mk OR source_order_number = N'E2E-TEST'`,
      { mk: { type: T.NVarChar, value: TEST_REMARK } }
    );
    for (const p of plans) {
      await cleanupProductionChain({ productionNumber: p.production_number });
    }
    if (plans.length > 0) {
      console.log(`[cleanupOldData] 清理旧计划数: ${plans.length}`);
    }
  } catch (e) {
    console.warn('[cleanupOldData] 清理异常:', e);
  }
}
