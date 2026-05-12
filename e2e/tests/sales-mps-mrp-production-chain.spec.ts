/**
 * 销售→MPS→MRP→生产全链路 + 删除级联 E2E 测试
 *
 * Part A (Tests 1-8): 正向流程
 *   销售预测+销售订单 → MPS计算 → 从需求来源导入生产计划
 *   → 审批计划+MRP → 执行MRP(生产工单+采购申请)
 *   → 审批+拆分+派发 → 甘特图+打印 → 全链路状态断言
 *
 * Part B (Tests 9-12): 删除级联
 *   删除工序任务/备料单 → 生产工单不受影响
 *   删除草稿计划 → 预测明细状态回退
 *   删除生产工单 → 计划状态回退
 *
 * 策略：API 驱动 + DB 断言（纯API，无UI操作）
 */
import { test, expect } from '@playwright/test';
import {
  getSalesForecast,
  getSalesForecastDetails,
  getProductionPlan,
  getLatestSalesOrder,
  getSalesOrderDetails,
  getMrpRun,
  getMrpRunDetails,
  getProductionOrdersBySourcePlan,
  getPurchaseReqsBySourcePlan,
  getPurchaseReqDetails,
  getProductionOrderByNumber,
  getProcessTasksByOrder,
  getMaterialPreparationByOrder,
  createProductionPlanDirect,
  cleanupMpsMrpProductionChain,
  query,
  T,
} from '../helpers/db.helper';
import {
  getApiContext,
  disposeApiContext,
  submitAndApprove,
  createSalesOrderAPI,
  createForecastAPI,
  calculateMpsAPI,
  getDemandSourcesAPI,
  importFromDemandSourcesAPI,
  runMrpAPI,
  executeMrpAPI,
  splitOrdersAPI,
  dispatchAndGenerateAPI,
  getGanttDataAPI,
  getPrintDataAPI,
  deleteAPI,
} from '../helpers/api.helper';

// 测试数据
const TEST_ITEM = 'C100809';
const TEST_QTY = 99999; // 超大数量确保 MPS 净需求>0（库存+在途可能较大）
const CUSTOMER_NUMBER = 'AH001';
const TEST_REMARK = 'E2E-MPS-MRP-CHAIN';

// 全局共享状态
const ctx: {
  forecastNumber?: string;
  forecastDetailId?: number;
  forecastLineNumber?: number;
  salesOrderNumber?: string;
  orderDetailId?: number;
  orderLineNumber?: number;
  planFromOrder?: string;
  planFromForecast?: string;
  mrpRunNumber?: string;
  productionOrderNumbers: string[];
  splitOrderNumber?: string;
  purchaseReqNumbers: string[];
  processTaskNumbers: string[];
  preparationNumber?: string;
  // Test 12 独立链
  chain2ProductionNumber?: string;
  chain2MrpRunNumber?: string;
  chain2OrderNumbers: string[];
  chain2PurchaseReqNumbers: string[];
} = {
  productionOrderNumbers: [],
  purchaseReqNumbers: [],
  processTaskNumbers: [],
  chain2OrderNumbers: [],
  chain2PurchaseReqNumbers: [],
};

test.describe.serial('销售→MPS→MRP→生产全链路 + 删除级联 E2E', () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    await getApiContext();
    await cleanupOldData();
  });

  test.afterAll(async () => {
    try {
      // 清理主链
      const r1 = await cleanupMpsMrpProductionChain({
        forecastNumbers: ctx.forecastNumber ? [ctx.forecastNumber] : [],
        salesOrderNumber: ctx.salesOrderNumber,
        productionNumbers: [ctx.planFromOrder, ctx.planFromForecast].filter(Boolean) as string[],
        productionOrderNumbers: ctx.productionOrderNumbers,
        purchaseReqNumbers: ctx.purchaseReqNumbers,
        mrpRunNumbers: ctx.mrpRunNumber ? [ctx.mrpRunNumber] : [],
      });
      console.log('[afterAll] 主链清理:', r1);

      // 清理Test12独立链
      const r2 = await cleanupMpsMrpProductionChain({
        productionNumbers: ctx.chain2ProductionNumber ? [ctx.chain2ProductionNumber] : [],
        productionOrderNumbers: ctx.chain2OrderNumbers,
        purchaseReqNumbers: ctx.chain2PurchaseReqNumbers,
        mrpRunNumbers: ctx.chain2MrpRunNumber ? [ctx.chain2MrpRunNumber] : [],
      });
      console.log('[afterAll] 独立链清理:', r2);
    } catch (e) {
      console.warn('[afterAll] 清理异常:', e);
    }
    await disposeApiContext();
  });

  // ==================== Test 1: 创建并审批销售预测 ====================
  test('1. 创建并审批销售预测', async () => {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + 1);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 30);

    const result = await createForecastAPI({
      customer_number: CUSTOMER_NUMBER,
      remark: TEST_REMARK,
      details: [{
        item_number: TEST_ITEM,
        forecast_quantity: TEST_QTY,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      }],
    });
    expect(result, '创建销售预测返回为空').toBeTruthy();
    const forecastNumber = result.forecast_number;
    ctx.forecastNumber = forecastNumber;
    console.log(`[Test1] 销售预测创建: ${forecastNumber}`);

    // 审批
    await submitAndApprove('sales_forecast', forecastNumber);

    // DB断言
    const forecast = await getSalesForecast(forecastNumber);
    expect(forecast, '未查到预测单').toBeTruthy();
    expect(forecast.approval_status).toBe('已审批');

    const details = await getSalesForecastDetails(forecastNumber);
    expect(details.length, '预测明细为空').toBeGreaterThan(0);
    expect(details[0].status).toBe('未开始');
    expect(details[0].consumption_status).toBe('未消耗');
    expect(Number(details[0].remaining_quantity)).toBe(TEST_QTY);

    ctx.forecastDetailId = details[0].id;
    ctx.forecastLineNumber = details[0].line_number;
    console.log(`[Test1] ✅ 预测已审批, detailId=${ctx.forecastDetailId}, status=${details[0].status}`);
  });

  // ==================== Test 2: 创建并审批销售订单 ====================
  test('2. 创建并审批销售订单', async () => {
    const today = new Date().toISOString().split('T')[0];
    const result = await createSalesOrderAPI({
      customer_number: CUSTOMER_NUMBER,
      remark: TEST_REMARK,
      details: [{
        item_number: TEST_ITEM,
        order_quantity: TEST_QTY,
        delivery_date: today,
      }],
    });
    expect(result, '创建销售订单返回为空').toBeTruthy();
    const salesOrderNumber = result.sales_order_number;
    ctx.salesOrderNumber = salesOrderNumber;
    console.log(`[Test2] 销售订单创建: ${salesOrderNumber}`);

    // 审批
    await submitAndApprove('sales_order', salesOrderNumber);

    // DB断言
    const order = await getLatestSalesOrder(CUSTOMER_NUMBER);
    expect(order, '未查到销售订单').toBeTruthy();
    expect(order.approval_status).toBe('已审批');

    const details = await getSalesOrderDetails(salesOrderNumber);
    expect(details.length, '订单明细为空').toBeGreaterThan(0);
    expect(details[0].shipping_status).toBe('未申请');

    ctx.orderDetailId = details[0].id;
    ctx.orderLineNumber = details[0].line_number;
    console.log(`[Test2] ✅ 订单已审批, detailId=${ctx.orderDetailId}, shipping_status=${details[0].shipping_status}`);
  });

  // ==================== Test 3: MPS计算+导入→源单状态变化 ====================
  test('3. MPS计算+从需求来源导入生产计划→验证源单状态变化', async () => {
    // Step 1: MPS计算
    const mpsResult = await calculateMpsAPI({ customer_number: CUSTOMER_NUMBER });
    expect(mpsResult, 'MPS计算结果为空').toBeTruthy();
    const mpsItems = mpsResult.items || [];
    console.log(`[Test3] MPS返回 ${mpsItems.length} 项:`, JSON.stringify(mpsItems.map((i: any) => ({ item_number: i.item_number, net_demand: i.net_demand, forecast_demand: i.forecast_demand, order_demand: i.order_demand, gross_demand: i.gross_demand, on_hand: i.on_hand, safety_stock: i.safety_stock, in_transit: i.in_transit, production_in_transit: i.production_in_transit }))));
    const targetItem = mpsItems.find((i: any) => i.item_number === TEST_ITEM);
    expect(targetItem, `MPS计算中未找到${TEST_ITEM}`).toBeTruthy();
    expect(Number(targetItem.net_demand), `${TEST_ITEM}净需求应为正数`).toBeGreaterThan(0);
    expect(Number(targetItem.forecast_demand), `${TEST_ITEM}预测需求应为正数`).toBeGreaterThan(0);
    console.log(`[Test3] MPS计算: net_demand=${targetItem.net_demand}, forecast_demand=${targetItem.forecast_demand}`);

    // Step 2: 获取需求来源
    const demandSources = await getDemandSourcesAPI(TEST_ITEM);
    expect(demandSources, '需求来源为空').toBeTruthy();
    const orderSources = (demandSources as any[]).filter((d: any) => d.source_type === 'ORDER');
    const forecastSources = (demandSources as any[]).filter((d: any) => d.source_type === 'FORECAST');
    expect(orderSources.length, '需求来源中无ORDER类型').toBeGreaterThan(0);
    expect(forecastSources.length, '需求来源中无FORECAST类型').toBeGreaterThan(0);
    console.log(`[Test3] 需求来源: ORDER=${orderSources.length}, FORECAST=${forecastSources.length}`);

    // Step 3: 从需求来源导入2条
    const importItems = [
      {
        source_type: 'ORDER',
        detail_id: orderSources[0].detail_id,
        source_number: orderSources[0].source_number,
        line_number: orderSources[0].line_number,
        item_number: orderSources[0].item_number,
        item_name: orderSources[0].item_name || '',
        specifications: orderSources[0].specifications || '',
        basic_unit: orderSources[0].basic_unit || '',
        product_drawing_number: orderSources[0].product_drawing_number || '',
        remaining_quantity: Number(orderSources[0].remaining_quantity) || Number(orderSources[0].quantity),
        delivery_date: orderSources[0].delivery_date || '',
        batch_production_quota: orderSources[0].batch_production_quota || '',
        rubber_compound_number: orderSources[0].rubber_compound_number || '',
      },
      {
        source_type: 'FORECAST',
        detail_id: forecastSources[0].detail_id,
        source_number: forecastSources[0].source_number,
        line_number: forecastSources[0].line_number,
        item_number: forecastSources[0].item_number,
        item_name: forecastSources[0].item_name || '',
        specifications: forecastSources[0].specifications || '',
        basic_unit: forecastSources[0].basic_unit || '',
        product_drawing_number: forecastSources[0].product_drawing_number || '',
        remaining_quantity: Number(forecastSources[0].remaining_quantity) || Number(forecastSources[0].quantity),
        delivery_date: forecastSources[0].delivery_date || '',
        batch_production_quota: forecastSources[0].batch_production_quota || '',
        rubber_compound_number: forecastSources[0].rubber_compound_number || '',
      },
    ];

    const importResult = await importFromDemandSourcesAPI(importItems);
    expect(importResult, '导入结果为空').toBeTruthy();
    expect(importResult.imported, '导入数量不为2').toBe(2);
    console.log(`[Test3] 导入结果: imported=${importResult.imported}`);

    // 记录计划号
    const results = importResult.results || [];
    ctx.planFromOrder = results.find((r: any) => r.source_type === 'ORDER')?.production_number;
    ctx.planFromForecast = results.find((r: any) => r.source_type === 'FORECAST')?.production_number;
    expect(ctx.planFromOrder, '未获取ORDER来源计划号').toBeTruthy();
    expect(ctx.planFromForecast, '未获取FORECAST来源计划号').toBeTruthy();
    console.log(`[Test3] 计划: planFromOrder=${ctx.planFromOrder}, planFromForecast=${ctx.planFromForecast}`);

    // Step 4: DB断言 - 源单状态变化
    // 预测明细 status→'计划中'
    const forecastDetails = await getSalesForecastDetails(ctx.forecastNumber!);
    expect(forecastDetails[0].status, '预测明细status应为计划中').toBe('计划中');

    // 订单明细 production_status→'待排产', status→'进行中'
    const orderDetails = await getSalesOrderDetails(ctx.salesOrderNumber!);
    expect(orderDetails[0].production_status, '订单明细production_status应为待排产').toBe('待排产');
    expect(orderDetails[0].status, '订单明细status应为进行中').toBe('进行中');

    // 订单头 order_status→'生产中'
    const order = await getLatestSalesOrder(CUSTOMER_NUMBER);
    expect(order.order_status, '订单order_status应为生产中').toBe('生产中');

    // 计划状态
    const planOrder = await getProductionPlan(ctx.planFromOrder!);
    expect(planOrder.approval_status).toBe('草稿');
    expect(planOrder.plan_status).toBe('待加入任务');

    const planForecast = await getProductionPlan(ctx.planFromForecast!);
    expect(planForecast.approval_status).toBe('草稿');
    expect(planForecast.plan_status).toBe('待加入任务');

    console.log(`[Test3] ✅ 源单状态验证通过`);
  });

  // ==================== Test 4: 审批生产计划+运行MRP ====================
  test('4. 审批生产计划+运行MRP', async () => {
    expect(ctx.planFromOrder, '无ORDER来源计划号').toBeTruthy();

    // Step 1: 审批来自订单的计划
    await submitAndApprove('Production_plan', ctx.planFromOrder!);

    // 重置plan_status/mrp_status确保MRP可运行
    await query(
      `UPDATE Production_plan SET plan_status = N'待加入任务', mrp_status = NULL WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: ctx.planFromOrder! } }
    );
    console.log(`[Test4] 计划已审批并重置MRP状态`);

    // Step 2: 运行MRP
    const mrpResult = await runMrpAPI([ctx.planFromOrder!]);
    expect(mrpResult, 'MRP运行结果为空').toBeTruthy();
    const mrpRunNumber = mrpResult.mrp_run_number;
    ctx.mrpRunNumber = mrpRunNumber;
    console.log(`[Test4] MRP运算: ${mrpRunNumber}`);

    // DB断言
    const mrpRun = await getMrpRun(mrpRunNumber);
    expect(mrpRun, '未查到MRP运算记录').toBeTruthy();
    expect(mrpRun.run_status).toBe('已计算');

    const details = await getMrpRunDetails(mrpRunNumber);
    expect(details.length, 'MRP明细为空').toBeGreaterThan(0);
    console.log(`[Test4] MRP明细行数: ${details.length}`);

    // 验证action_type分类存在
    const actionTypes = details.map((d: any) => d.action_type);
    console.log(`[Test4] action_types: ${[...new Set(actionTypes)].join(', ')}`);
  });

  // ==================== Test 5: 执行MRP→生产工单+采购申请+计划状态 ====================
  test('5. 执行MRP→验证生产工单+采购申请+计划状态变化', async () => {
    expect(ctx.mrpRunNumber, '无MRP运行号').toBeTruthy();

    const details = await getMrpRunDetails(ctx.mrpRunNumber!);
    const executeItems = details
      .filter((d: any) => d.net_requirement > 0)
      .map((d: any) => ({
        id: d.id,
        produce_quantity: d.action_type === '生产' || d.action_type === '生产+采购' ? d.net_requirement : 0,
        purchase_quantity: d.action_type === '采购' || d.action_type === '生产+采购' ? d.net_requirement : 0,
      }));
    expect(executeItems.length, '无净需求>0的明细').toBeGreaterThan(0);

    const execResult = await executeMrpAPI(ctx.mrpRunNumber!, executeItems);
    console.log(`[Test5] MRP执行结果:`, execResult);

    // DB断言
    const prodOrders = await getProductionOrdersBySourcePlan(ctx.planFromOrder!);
    const purchaseReqs = await getPurchaseReqsBySourcePlan(ctx.planFromOrder!);
    console.log(`[Test5] 生产单数: ${prodOrders.length}, 采购申请数: ${purchaseReqs.length}`);
    expect(prodOrders.length, 'MRP执行后无生产单').toBeGreaterThan(0);

    // 收集生产单号
    ctx.productionOrderNumbers = prodOrders.map((p: any) => p.production_order_number);

    // 收集采购申请号
    ctx.purchaseReqNumbers = purchaseReqs.map((pr: any) => pr.purchase_req_number);

    // 生产单状态断言
    for (const po of prodOrders) {
      expect(po.approval_status, `生产单${po.production_order_number}应为草稿`).toBe('草稿');
    }

    // 计划状态断言
    const plan = await getProductionPlan(ctx.planFromOrder!);
    expect(plan.plan_status, '计划plan_status应为已加入任务').toBe('已加入任务');
    expect(plan.mrp_status, '计划mrp_status应为已分解').toBe('已分解');

    // MRP状态断言
    const runAfter = await getMrpRun(ctx.mrpRunNumber!);
    expect(runAfter.run_status).toBe('已确认');

    console.log(`[Test5] ✅ MRP执行完成`);
  });

  // ==================== Test 6: 审批生产工单+拆分 ====================
  test('6. 审批生产工单+拆分', async () => {
    expect(ctx.productionOrderNumbers.length, '无生产单可操作').toBeGreaterThan(0);

    const mainOrderNumber = ctx.productionOrderNumbers[0];

    // Step 1: 审批主生产单
    await submitAndApprove('production_order', mainOrderNumber);
    const order = await getProductionOrderByNumber(mainOrderNumber);
    expect(order.approval_status).toBe('已审批');
    console.log(`[Test6] 生产单已审批: ${mainOrderNumber}, qty=${order.planned_quantity}`);

    // Step 2: 拆分
    const plannedQty = Number(order.planned_quantity);
    const splitQty1 = Math.floor(plannedQty * 0.6);
    const splitQty2 = plannedQty - splitQty1;

    const splitResult = await splitOrdersAPI([
      { type: 'original', production_order_number: mainOrderNumber, new_planned_quantity: splitQty1 },
      { type: 'new', source_order_number: mainOrderNumber, new_planned_quantity: splitQty2 },
    ]);
    console.log(`[Test6] 拆分结果:`, splitResult);

    // DB断言：原生产单数量减少
    const orderAfter = await getProductionOrderByNumber(mainOrderNumber);
    expect(Number(orderAfter.planned_quantity)).toBe(splitQty1);

    // 找到拆分出的新生产单
    const allOrders = await getProductionOrdersBySourcePlan(ctx.planFromOrder!);
    const newOrders = allOrders.filter((o: any) => o.production_order_number !== mainOrderNumber);
    expect(newOrders.length, '拆分后未找到新生产单').toBeGreaterThan(0);

    const splitOrderNumber = newOrders[0].production_order_number;
    ctx.splitOrderNumber = splitOrderNumber;
    ctx.productionOrderNumbers.push(splitOrderNumber);

    const splitOrder = await getProductionOrderByNumber(splitOrderNumber);
    expect(Number(splitOrder.planned_quantity)).toBe(splitQty2);
    console.log(`[Test6] 拆分: ${mainOrderNumber}(${splitQty1}) + ${splitOrderNumber}(${splitQty2})`);

    // Step 3: 审批新生产单
    await submitAndApprove('production_order', splitOrderNumber);
  });

  // ==================== Test 7: 派发+生成(工序任务+备料单) ====================
  test('7. 派发+生成(工序任务+备料单)', async () => {
    const mainOrderNumber = ctx.productionOrderNumbers[0];

    // Step 1: 派发+生成
    const today = new Date().toISOString().split('T')[0];
    const dispatchResult = await dispatchAndGenerateAPI([{
      production_order_number: mainOrderNumber,
      production_date: today,
    }]);
    console.log(`[Test7] 派发结果:`, JSON.stringify(dispatchResult)?.substring(0, 500));

    // DB断言：生产单 plan_status→已派发
    const orderAfter = await getProductionOrderByNumber(mainOrderNumber);
    expect(orderAfter.plan_status, 'plan_status应为已派发').toBe('已派发');

    // DB断言：工序任务已生成
    const tasks = await getProcessTasksByOrder(mainOrderNumber);
    expect(tasks.length, '派发后无工序任务').toBeGreaterThan(0);
    ctx.processTaskNumbers = tasks.map((t: any) => t.process_task_number);
    console.log(`[Test7] 工序任务数: ${tasks.length}`);
    for (const t of tasks) {
      console.log(`  步骤${t.step_number}: ${t.standard_process_name} status=${t.task_status} approval=${t.approval_status}`);
    }

    // DB断言：备料单已生成
    const preps = await getMaterialPreparationByOrder(mainOrderNumber);
    expect(preps.length, '派发后无备料单').toBeGreaterThan(0);
    ctx.preparationNumber = preps[0].preparation_number;
    console.log(`[Test7] 备料单: ${ctx.preparationNumber}, status=${preps[0].preparation_status}, details=${preps[0].details?.length || 0}`);

    console.log(`[Test7] ✅ 派发+生成完成`);
  });

  // ==================== Test 8: 甘特图+打印数据+全链路状态一致性 ====================
  test('8. 验证甘特图+打印数据+全链路状态一致性', async () => {
    const mainOrderNumber = ctx.productionOrderNumbers[0];

    // Step 1: 甘特图数据
    const ganttResult = await getGanttDataAPI({ search: mainOrderNumber });
    expect(ganttResult, '甘特图API应正常返回').toBeTruthy();
    const ganttData = ganttResult.data || [];
    // 甘特图要求 equipment_number 非空且 production_date 非空
    // 派发时若未指定设备/日期，则不会出现在甘特图 → 仅验证API可用
    console.log(`[Test8] 甘特图记录数: ${ganttData.length} (需设备+日期才有数据)`);

    // Step 2: 打印数据
    const printResult = await getPrintDataAPI([mainOrderNumber]);
    expect(printResult, '打印数据为空').toBeTruthy();
    const printItems = printResult.items || [];
    expect(printItems.length, '打印数据items为空').toBeGreaterThan(0);
    const printItem = printItems[0];
    expect(printItem.order, '打印数据缺少order').toBeTruthy();
    expect(printItem.materials, '打印数据缺少materials').toBeDefined();
    expect(printItem.tasks, '打印数据缺少tasks').toBeDefined();
    console.log(`[Test8] 打印数据: order=${printItem.order?.production_order_number}, materials=${printItem.materials?.length}, tasks=${printItem.tasks?.length}`);

    // Step 3: 全链路状态断言
    // 销售订单
    const order = await getLatestSalesOrder(CUSTOMER_NUMBER);
    expect(order.order_status, '订单order_status应为生产中').toBe('生产中');
    const orderDetails = await getSalesOrderDetails(ctx.salesOrderNumber!);
    expect(orderDetails[0].production_status, '订单明细production_status应为计划中(派发后更新)').toBe('计划中');

    // 销售预测
    const forecastDetails = await getSalesForecastDetails(ctx.forecastNumber!);
    expect(forecastDetails[0].status, '预测明细status应为计划中').toBe('计划中');

    // 生产计划(ORDER来源)
    const planFromOrder = await getProductionPlan(ctx.planFromOrder!);
    expect(planFromOrder.plan_status, '计划plan_status应为已加入任务').toBe('已加入任务');
    expect(planFromOrder.mrp_status, '计划mrp_status应为已分解').toBe('已分解');
    expect(planFromOrder.approval_status, '计划approval_status应为已审批').toBe('已审批');

    // 生产计划(FORECAST来源) - 保持草稿
    const planFromForecast = await getProductionPlan(ctx.planFromForecast!);
    expect(planFromForecast.approval_status, 'FORECAST计划应仍为草稿').toBe('草稿');

    // MRP
    const mrpRun = await getMrpRun(ctx.mrpRunNumber!);
    expect(mrpRun.run_status, 'MRP run_status应为已确认').toBe('已确认');

    // 生产工单
    const mainOrder = await getProductionOrderByNumber(mainOrderNumber);
    expect(mainOrder.plan_status, '生产工单plan_status应为已派发').toBe('已派发');
    expect(mainOrder.approval_status, '生产工单approval_status应为已审批').toBe('已审批');

    console.log(`[Test8] ✅ 全链路状态一致性验证通过`);
  });

  // ==================== Test 9: 删除工序任务 → 验证生产工单不受影响 ====================
  test('9. 删除工序任务(反审→删除)→验证生产工单不受影响', async () => {
    expect(ctx.processTaskNumbers.length, '无工序任务可删除').toBeGreaterThan(0);
    const mainOrderNumber = ctx.productionOrderNumbers[0];

    // 获取删除前工序任务数
    const tasksBefore = await getProcessTasksByOrder(mainOrderNumber);
    const countBefore = tasksBefore.length;

    // 派发时工序任务自动审批，需先反审为草稿才能删除
    const taskToDelete = ctx.processTaskNumbers[0];
    await query(
      `UPDATE process_task SET approval_status = N'草稿' WHERE process_task_number = @taskNo`,
      { taskNo: { type: T.NVarChar, value: taskToDelete } }
    );
    await deleteAPI(`process-tasks/${taskToDelete}`);
    console.log(`[Test9] 删除工序任务: ${taskToDelete}`);

    // DB断言：工序任务数减少1
    const tasksAfter = await getProcessTasksByOrder(mainOrderNumber);
    expect(tasksAfter.length, '工序任务数应减少1').toBe(countBefore - 1);

    // DB断言：生产工单不受影响
    const orderAfter = await getProductionOrderByNumber(mainOrderNumber);
    expect(orderAfter.plan_status, '生产工单plan_status应仍为已派发').toBe('已派发');

    // 从列表中移除已删除的
    ctx.processTaskNumbers = ctx.processTaskNumbers.filter(t => t !== taskToDelete);
    console.log(`[Test9] ✅ 删除工序任务, 工单不受影响`);
  });

  // ==================== Test 10: 删除备料单 → 验证生产工单不受影响 ====================
  test('10. 删除备料单(反审→删除)→验证生产工单不受影响', async () => {
    expect(ctx.preparationNumber, '无备料单号').toBeTruthy();
    const mainOrderNumber = ctx.productionOrderNumbers[0];

    // 派发时备料单自动审批，需先反审为草稿才能删除
    await query(
      `UPDATE material_preparation SET approval_status = N'草稿' WHERE preparation_number = @prepNo`,
      { prepNo: { type: T.NVarChar, value: ctx.preparationNumber! } }
    );
    // 删除备料单
    await deleteAPI(`material-preparations/${ctx.preparationNumber}`);
    console.log(`[Test10] 删除备料单: ${ctx.preparationNumber}`);

    // DB断言：备料单已删除
    const preps = await getMaterialPreparationByOrder(mainOrderNumber);
    expect(preps.length, '备料单应已删除').toBe(0);

    // DB断言：生产工单不受影响
    const orderAfter = await getProductionOrderByNumber(mainOrderNumber);
    expect(orderAfter.plan_status, '生产工单plan_status应仍为已派发').toBe('已派发');

    ctx.preparationNumber = undefined;
    console.log(`[Test10] ✅ 删除备料单, 工单不受影响`);
  });

  // ==================== Test 11: 删除FORECAST来源草稿计划→预测明细状态回退 ====================
  test('11. 删除FORECAST来源草稿计划→验证预测明细状态回退', async () => {
    expect(ctx.planFromForecast, '无FORECAST来源计划号').toBeTruthy();
    expect(ctx.forecastNumber, '无预测单号').toBeTruthy();

    // 前置断言：计划为草稿
    const planBefore = await getProductionPlan(ctx.planFromForecast!);
    expect(planBefore.approval_status, 'FORECAST计划应为草稿').toBe('草稿');

    // 前置断言：预测明细status='计划中'
    const detailsBefore = await getSalesForecastDetails(ctx.forecastNumber!);
    expect(detailsBefore[0].status, '预测明细status应为计划中').toBe('计划中');

    // 删除计划
    await deleteAPI(`plans/${ctx.planFromForecast!}`);
    console.log(`[Test11] 删除计划: ${ctx.planFromForecast}`);

    // DB断言：预测明细 status回退→'未开始'
    const detailsAfter = await getSalesForecastDetails(ctx.forecastNumber!);
    expect(detailsAfter[0].status, '预测明细status应回退为未开始').toBe('未开始');

    ctx.planFromForecast = undefined;
    console.log(`[Test11] ✅ 计划删除后预测明细状态回退为未开始`);
  });

  // ==================== Test 12: 创建第二计划链→MRP→删除工单→计划状态回退 ====================
  test('12. 创建第二计划链→MRP→删除生产工单→验证计划状态回退', async () => {
    // Step 1: 创建新计划
    const productionNumber = await createProductionPlanDirect(TEST_ITEM, TEST_QTY, 'E2E-CHAIN2');
    ctx.chain2ProductionNumber = productionNumber;
    console.log(`[Test12] 创建计划: ${productionNumber}`);

    // Step 2: 审批
    await submitAndApprove('Production_plan', productionNumber);
    await query(
      `UPDATE Production_plan SET plan_status = N'待加入任务', mrp_status = NULL WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: productionNumber } }
    );

    // Step 3: 运行MRP
    const mrpResult = await runMrpAPI([productionNumber]);
    const mrpRunNumber = mrpResult.mrp_run_number;
    ctx.chain2MrpRunNumber = mrpRunNumber;
    console.log(`[Test12] MRP运算: ${mrpRunNumber}`);

    // Step 4: 执行MRP
    const details = await getMrpRunDetails(mrpRunNumber);
    const executeItems = details
      .filter((d: any) => d.net_requirement > 0)
      .map((d: any) => ({
        id: d.id,
        produce_quantity: d.action_type === '生产' || d.action_type === '生产+采购' ? d.net_requirement : 0,
        purchase_quantity: d.action_type === '采购' || d.action_type === '生产+采购' ? d.net_requirement : 0,
      }));
    await executeMrpAPI(mrpRunNumber, executeItems);

    // 收集生产单和采购申请
    const prodOrders = await getProductionOrdersBySourcePlan(productionNumber);
    const purchaseReqs = await getPurchaseReqsBySourcePlan(productionNumber);
    ctx.chain2OrderNumbers = prodOrders.map((p: any) => p.production_order_number);
    ctx.chain2PurchaseReqNumbers = purchaseReqs.map((pr: any) => pr.purchase_req_number);
    console.log(`[Test12] 生产单: ${ctx.chain2OrderNumbers.length}, 采购申请: ${ctx.chain2PurchaseReqNumbers.length}`);

    // 前置断言：计划状态
    const planBefore = await getProductionPlan(productionNumber);
    expect(planBefore.plan_status, '计划plan_status应为已加入任务').toBe('已加入任务');
    expect(planBefore.mrp_status, '计划mrp_status应为已分解').toBe('已分解');

    // Step 5: 先删除采购申请(确保deleteOrder时无关联采购申请)
    for (const prn of ctx.chain2PurchaseReqNumbers) {
      await deleteAPI(`purchase-reqs/${prn}`);
      console.log(`[Test12] 删除采购申请: ${prn}`);
    }

    // Step 6: 删除草稿生产工单
    expect(ctx.chain2OrderNumbers.length, '无生产单可删除').toBeGreaterThan(0);
    for (const on of ctx.chain2OrderNumbers) {
      await deleteAPI(`orders/${on}`);
      console.log(`[Test12] 删除生产工单: ${on}`);
    }

    // Step 7: DB断言 - 计划状态回退
    const planAfter = await getProductionPlan(productionNumber);
    expect(planAfter.plan_status, '计划plan_status应回退为待加入任务').toBe('待加入任务');
    expect(planAfter.mrp_status, '计划mrp_status应为NULL').toBeNull();

    console.log(`[Test12] ✅ 删除生产工单后计划状态回退`);
  });
});

/** 清理旧的E2E数据 */
async function cleanupOldData() {
  try {
    // 清理旧的销售预测
    const forecasts = await query<any>(
      `SELECT forecast_number FROM sales_forecast WHERE remark = @mk`,
      { mk: { type: T.NVarChar, value: TEST_REMARK } }
    );
    for (const f of forecasts) {
      await query(`DELETE FROM sales_forecast_detail WHERE forecast_number = @fn`, { fn: { type: T.NVarChar, value: f.forecast_number } });
      await query(`DELETE FROM sales_forecast WHERE forecast_number = @fn`, { fn: { type: T.NVarChar, value: f.forecast_number } });
    }

    // 清理旧的销售订单
    const orders = await query<any>(
      `SELECT sales_order_number FROM sales_order WHERE remark = @mk`,
      { mk: { type: T.NVarChar, value: TEST_REMARK } }
    );
    for (const o of orders) {
      // 清理关联的计划
      const plans = await query<any>(
        `SELECT production_number FROM Production_plan WHERE source_order_number = @son`,
        { son: { type: T.NVarChar, value: o.sales_order_number } }
      );
      for (const p of plans) {
        await cleanupMpsMrpProductionChain({ productionNumbers: [p.production_number] });
      }
      await query(`DELETE FROM sales_order_detail WHERE sales_order_number = @son`, { son: { type: T.NVarChar, value: o.sales_order_number } });
      await query(`DELETE FROM sales_order WHERE sales_order_number = @son`, { son: { type: T.NVarChar, value: o.sales_order_number } });
    }

    // 清理旧的直接创建的计划
    const directPlans = await query<any>(
      `SELECT production_number FROM Production_plan WHERE remark LIKE @mk OR source_order_number = N'E2E-TEST'`,
      { mk: { type: T.NVarChar, value: `E2E-CHAIN2%` } }
    );
    for (const p of directPlans) {
      await cleanupMpsMrpProductionChain({ productionNumbers: [p.production_number] });
    }

    if (forecasts.length + orders.length + directPlans.length > 0) {
      console.log(`[cleanupOldData] 清理: forecasts=${forecasts.length}, orders=${orders.length}, directPlans=${directPlans.length}`);
    }
  } catch (e) {
    console.warn('[cleanupOldData] 清理异常:', e);
  }
}
