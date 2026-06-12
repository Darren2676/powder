/**
 * 产品批次号产生规则 - 双模式方案 E2E 测试
 *
 * 测试场景：
 *   产品 110103 → 模式B（计划派发时预分配，批次号 = FB-{production_number}）
 *   产品 C100809 → 模式A（入库时自动生成，批次号 = FB-N-{YYYYMMDD}-{seq}）
 *
 * 全链路：配置规则 → 生产计划 → 审批 → MRP → 执行 → 拆分+派发 → 备料领料 → 报工 → 入库
 * 验证点：两个产品最终入库产生不同格式的批次号
 *
 * 策略：API 驱动 + DB 断言（纯API，无UI操作）
 */
import { test, expect } from '@playwright/test';
import {
  createProductionPlanDirect,
  getMrpRun,
  getMrpRunDetails,
  getProductionOrdersBySourcePlan,
  getProductionOrderByNumber,
  getProcessTasksByOrder,
  getMaterialPreparationByOrder,
  batchApproveProcessTasks,
  seedMaterialInventory,
  getFinishedBatchInventory,
  cleanupProductionChain,
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
  getProductionInspectionsByOrderAPI,
  completeProductionInspectionAPI,
} from '../helpers/api.helper';

// ==================== 测试常量 ====================

const ITEM_MODE_B = '110103';   // 模式B产品（计划派发时预分配批次号）
const ITEM_MODE_A = 'C100809';  // 模式A产品（入库时自动生成批次号）
const NINGGUO_FACTORY_ID = 14;  // 宁国工厂ID
const TEST_QTY = 5000;
const TEST_REMARK = 'E2E-BATCH-DUAL-MODE';
const WAREHOUSE_RAW = '04';      // 原材料仓库
const WAREHOUSE_FINISHED = '01'; // 成品仓

// ==================== 共享上下文 ====================

const ctx: {
  ruleIds: number[];
  productionNumberB?: string;
  mrpRunNumberB?: string;
  productionOrderNumbersB: string[];
  splitOrderNumberB?: string;
  preparationNumberB?: string;
  productionNumberA?: string;
  mrpRunNumberA?: string;
  productionOrderNumbersA: string[];
  preparationNumberA?: string;
} = {
  ruleIds: [],
  productionOrderNumbersB: [],
  productionOrderNumbersA: [],
};

test.describe.serial('产品批次号双模式方案 E2E', () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    await getApiContext();
    await cleanupOldData();
    await setupBatchNumberRules();
  });

  test.afterAll(async () => {
    try {
      if (ctx.productionNumberB) {
        await cleanupProductionChain({
          productionNumber: ctx.productionNumberB,
          productionOrderNumbers: ctx.productionOrderNumbersB,
          mrpRunNumber: ctx.mrpRunNumberB,
        });
      }
      if (ctx.productionNumberA) {
        await cleanupProductionChain({
          productionNumber: ctx.productionNumberA,
          productionOrderNumbers: ctx.productionOrderNumbersA,
          mrpRunNumber: ctx.mrpRunNumberA,
        });
      }
      for (const id of ctx.ruleIds) {
        await query(`DELETE FROM batch_number_rule_config WHERE id = @id`, { id: { type: T.Int, value: id } });
      }
      console.log('[afterAll] 清理完成');
    } catch (e) {
      console.warn('[afterAll] 清理异常:', e);
    }
    await disposeApiContext();
  });

  // ==================== Test 1: 配置批次号规则 ====================
  test('1. 配置产品批次号规则（110103=模式B, C100809=模式A）', async () => {
    const existingB = await query<any>(
      `SELECT id, batch_rule_mode, append_split_seq FROM batch_number_rule_config WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: ITEM_MODE_B } }
    );

    if (existingB.length > 0) {
      await query(
        `UPDATE batch_number_rule_config SET batch_rule_mode = N'B', append_split_seq = 1, is_active = N'是', batch_number_template = N'FB-{plan_number}' WHERE item_number = @item`,
        { item: { type: T.NVarChar, value: ITEM_MODE_B } }
      );
      ctx.ruleIds.push(existingB[0].id);
      console.log(`[Test1] 产品${ITEM_MODE_B}规则已更新为模式B (id=${existingB[0].id})`);
    } else {
      const itemNameRows = await query<any>(
        `SELECT item_name FROM item_master WHERE item_number = @item`,
        { item: { type: T.NVarChar, value: ITEM_MODE_B } }
      );
      const itemNameB = itemNameRows[0]?.item_name || '';
      await query(
        `INSERT INTO batch_number_rule_config (item_number, item_name, factory_id, batch_rule_mode, batch_number_template, append_split_seq, is_active, creation_man, last_updater)
         VALUES (@item, @name, NULL, N'B', N'FB-{plan_number}', 1, N'是', N'e2e', N'e2e')`,
        { item: { type: T.NVarChar, value: ITEM_MODE_B }, name: { type: T.NVarChar, value: itemNameB } }
      );
      const newRule = await query<any>(
        `SELECT id FROM batch_number_rule_config WHERE item_number = @item`,
        { item: { type: T.NVarChar, value: ITEM_MODE_B } }
      );
      if (newRule[0]) ctx.ruleIds.push(newRule[0].id);
      console.log(`[Test1] 产品${ITEM_MODE_B}规则已创建为模式B (id=${newRule[0]?.id})`);
    }

    const existingA = await query<any>(
      `SELECT id, batch_rule_mode FROM batch_number_rule_config WHERE item_number = @item AND batch_rule_mode = N'B'`,
      { item: { type: T.NVarChar, value: ITEM_MODE_A } }
    );
    if (existingA.length > 0) {
      await query(
        `UPDATE batch_number_rule_config SET batch_rule_mode = N'A' WHERE item_number = @item`,
        { item: { type: T.NVarChar, value: ITEM_MODE_A } }
      );
      if (!ctx.ruleIds.includes(existingA[0].id)) ctx.ruleIds.push(existingA[0].id);
      console.log(`[Test1] 产品${ITEM_MODE_A}规则已改为模式A`);
    }

    const ruleB = await query<any>(
      `SELECT batch_rule_mode, append_split_seq FROM batch_number_rule_config WHERE item_number = @item AND is_active = N'是'`,
      { item: { type: T.NVarChar, value: ITEM_MODE_B } }
    );
    expect(ruleB.length, `产品${ITEM_MODE_B}无活跃规则`).toBeGreaterThan(0);
    expect(ruleB[0].batch_rule_mode).toBe('B');
    expect(!!ruleB[0].append_split_seq).toBe(true);
    console.log(`[Test1] ✅ 批次号规则配置完成: ${ITEM_MODE_B}=模式B(追加序号), ${ITEM_MODE_A}=模式A`);
  });

  // ==================== Test 2: 创建生产计划 + 审批 + MRP ====================
  test('2. 两个产品分别创建生产计划→审批→MRP→执行', async () => {
    // --- 模式B产品: 110103 ---
    const pnB = await createProductionPlanDirect(ITEM_MODE_B, TEST_QTY, TEST_REMARK + '-B');
    ctx.productionNumberB = pnB;
    console.log(`[Test2] 模式B计划: ${pnB}`);

    await query(
      `UPDATE Production_plan SET factory_id = @fid WHERE production_number = @pn`,
      { fid: { type: T.Int, value: NINGGUO_FACTORY_ID }, pn: { type: T.NVarChar, value: pnB } }
    );

    await submitAndApprove('Production_plan', pnB);
    await query(
      `UPDATE Production_plan SET plan_status = N'待加入任务', mrp_status = NULL WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: pnB } }
    );

    const mrpResultB = await runMrpAPI([pnB]);
    expect(mrpResultB, 'MRP运行结果为空').toBeTruthy();
    ctx.mrpRunNumberB = mrpResultB.mrp_run_number;

    const mrpRunB = await getMrpRun(ctx.mrpRunNumberB!);
    expect(mrpRunB.run_status).toBe('已计算');

    const detailsB = await getMrpRunDetails(ctx.mrpRunNumberB!);
    const executeItemsB = buildExecuteItems(detailsB);
    expect(executeItemsB.length, `产品${ITEM_MODE_B}无净需求`).toBeGreaterThan(0);

    await executeMrpAPI(ctx.mrpRunNumberB!, executeItemsB);

    const prodOrdersB = await getProductionOrdersBySourcePlan(pnB);
    ctx.productionOrderNumbersB = prodOrdersB.map((p: any) => p.production_order_number);
    console.log(`[Test2] 模式B生产单详情:`, prodOrdersB.map((p: any) => `${p.production_order_number}(item=${p.item_number},qty=${p.planned_quantity})`));
    const mainOrderBRow = prodOrdersB.find((p: any) => p.item_number === ITEM_MODE_B);
    if (mainOrderBRow) {
      const mainIdx = ctx.productionOrderNumbersB.indexOf(mainOrderBRow.production_order_number);
      if (mainIdx > 0) {
        ctx.productionOrderNumbersB.splice(mainIdx, 1);
        ctx.productionOrderNumbersB.unshift(mainOrderBRow.production_order_number);
      }
    }
    console.log(`[Test2] 模式B生产单: ${ctx.productionOrderNumbersB.join(', ')}`);

    // --- 模式A产品: C100809 ---
    const pnA = await createProductionPlanDirect(ITEM_MODE_A, TEST_QTY, TEST_REMARK + '-A');
    ctx.productionNumberA = pnA;
    console.log(`[Test2] 模式A计划: ${pnA}`);

    await query(
      `UPDATE Production_plan SET factory_id = @fid WHERE production_number = @pn`,
      { fid: { type: T.Int, value: NINGGUO_FACTORY_ID }, pn: { type: T.NVarChar, value: pnA } }
    );

    await submitAndApprove('Production_plan', pnA);
    await query(
      `UPDATE Production_plan SET plan_status = N'待加入任务', mrp_status = NULL WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: pnA } }
    );

    const mrpResultA = await runMrpAPI([pnA]);
    expect(mrpResultA, 'MRP运行结果为空').toBeTruthy();
    ctx.mrpRunNumberA = mrpResultA.mrp_run_number;

    const mrpRunA = await getMrpRun(ctx.mrpRunNumberA!);
    expect(mrpRunA.run_status).toBe('已计算');

    const detailsA = await getMrpRunDetails(ctx.mrpRunNumberA!);
    const executeItemsA = buildExecuteItems(detailsA);
    expect(executeItemsA.length, `产品${ITEM_MODE_A}无净需求`).toBeGreaterThan(0);

    await executeMrpAPI(ctx.mrpRunNumberA!, executeItemsA);

    const prodOrdersA = await getProductionOrdersBySourcePlan(pnA);
    ctx.productionOrderNumbersA = prodOrdersA.map((p: any) => p.production_order_number);
    console.log(`[Test2] 模式A生产单详情:`, prodOrdersA.map((p: any) => `${p.production_order_number}(item=${p.item_number},qty=${p.planned_quantity})`));
    const mainOrderARow = prodOrdersA.find((p: any) => p.item_number === ITEM_MODE_A);
    if (mainOrderARow) {
      const mainIdx = ctx.productionOrderNumbersA.indexOf(mainOrderARow.production_order_number);
      if (mainIdx > 0) {
        ctx.productionOrderNumbersA.splice(mainIdx, 1);
        ctx.productionOrderNumbersA.unshift(mainOrderARow.production_order_number);
      }
    }
    console.log(`[Test2] 模式A生产单: ${ctx.productionOrderNumbersA.join(', ')}`);

    console.log(`[Test2] ✅ 两产品MRP执行完成`);
  });

  // ==================== Test 3: 拆分（模式B产品）+ 派发 ====================
  test('3. 模式B产品拆分→预分配批次号验证→派发；模式A产品直接派发', async () => {
    // --- 模式B产品: 拆分 → 验证预分配批次号 → 派发 ---
    expect(ctx.productionOrderNumbersB.length, '模式B无生产单').toBeGreaterThan(0);
    const mainOrderB = ctx.productionOrderNumbersB[0];

    await submitAndApprove('production_order', mainOrderB);

    const ruleCheckB = await query<any>(
      `SELECT id, item_number, factory_id, batch_rule_mode, is_active FROM batch_number_rule_config WHERE item_number = @item AND is_active = N'是'`,
      { item: { type: T.NVarChar, value: ITEM_MODE_B } }
    );
    console.log(`[Test3] 拆分前110103规则检查:`, ruleCheckB);
    expect(ruleCheckB.length, '拆分前110103应存在活跃规则').toBeGreaterThan(0);
    expect(ruleCheckB[0].batch_rule_mode).toBe('B');

    // 拆分（5000 → 3000 + 2000）
    const splitResult = await splitOrdersAPI([
      { type: 'original', production_order_number: mainOrderB, new_planned_quantity: 3000 },
      { type: 'new', source_order_number: mainOrderB, new_planned_quantity: 2000 },
    ]);
    console.log(`[Test3] 模式B拆分结果:`, splitResult);

    const allOrdersB = await query<any>(
      `SELECT production_order_number, item_number, planned_quantity, preassigned_batch_number FROM production_order WHERE item_number = @item AND production_number = @pn AND production_order_number != @main`,
      { item: { type: T.NVarChar, value: ITEM_MODE_B }, pn: { type: T.NVarChar, value: ctx.productionNumberB! }, main: { type: T.NVarChar, value: mainOrderB } }
    );
    console.log(`[Test3] 拆分后110103生产单:`, allOrdersB);
    expect(allOrdersB.length, '拆分后未找到新的110103生产单').toBeGreaterThan(0);

    const splitOrderRow = allOrdersB.find((r: any) => r.preassigned_batch_number && r.preassigned_batch_number !== '');
    expect(splitOrderRow, '未找到有预分配批次号的拆分新单').toBeTruthy();
    const splitOrderB = splitOrderRow.production_order_number;
    ctx.splitOrderNumberB = splitOrderB;
    if (!ctx.productionOrderNumbersB.includes(splitOrderB)) {
      ctx.productionOrderNumbersB.push(splitOrderB);
    }

    const splitOrderQty = Number(splitOrderRow.planned_quantity);
    expect(splitOrderQty).toBe(2000);

    const orderB1 = await getOrderWithPreassignedBatch(mainOrderB);
    const orderB2 = await getOrderWithPreassignedBatch(splitOrderB);

    console.log(`[Test3] 模式B拆分后预分配批次号:`);
    console.log(`  原单${mainOrderB}: preassigned_batch_number = "${orderB1.preassigned_batch_number}"`);
    console.log(`  拆分单${splitOrderB}: preassigned_batch_number = "${orderB2.preassigned_batch_number}"`);

    expect(orderB2.preassigned_batch_number, '模式B拆分新单无预分配批次号').toBeTruthy();
    expect(orderB2.preassigned_batch_number).toMatch(/^FB-.+-S\d{2}$/);
    expect(orderB2.preassigned_batch_number).toContain('-S01');

    expect(!orderB1.preassigned_batch_number || orderB1.preassigned_batch_number === '', '原始行拆分后不应有预分配批次号').toBeTruthy();
    console.log(`[Test3] ✅ 拆分预分配批次号验证通过: 新增行=${orderB2.preassigned_batch_number}, 原始行待派发时分配`);

    await query(
      `UPDATE production_order SET approval_status = N'已审批' WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: splitOrderB } }
    );

    const today = new Date().toISOString().split('T')[0];
    const dispatchResultB = await dispatchAndGenerateAPI([{
      production_order_number: mainOrderB,
      production_date: today,
    }]);
    console.log(`[Test3] 模式B派发结果:`, JSON.stringify(dispatchResultB)?.substring(0, 300));

    const tasksB = await getProcessTasksByOrder(mainOrderB);
    expect(tasksB.length, '模式B派发后无工序任务').toBeGreaterThan(0);
    ctx.preparationNumberB = (await getMaterialPreparationByOrder(mainOrderB))[0]?.preparation_number;

    const dispatchResultB2 = await dispatchAndGenerateAPI([{
      production_order_number: splitOrderB,
      production_date: today,
    }]);
    console.log(`[Test3] 模式B拆分单派发完成`);

    const orderB1AfterDispatch = await getOrderWithPreassignedBatch(mainOrderB);
    console.log(`[Test3] 派发后原始行预分配批次号: ${orderB1AfterDispatch.preassigned_batch_number}`);
    expect(orderB1AfterDispatch.preassigned_batch_number, '派发后原始行应被分配预分配批次号').toBeTruthy();
    expect(orderB1AfterDispatch.preassigned_batch_number).toMatch(/^FB-[^N]/);
    const dispatchPrefix = orderB1AfterDispatch.preassigned_batch_number.replace(/-S\d{2}$/, '');
    const splitPrefix = orderB2.preassigned_batch_number!.replace(/-S\d{2}$/, '');
    expect(dispatchPrefix).toBe(splitPrefix);
    console.log(`[Test3] ✅ 原始行派发后预分配批次号: ${orderB1AfterDispatch.preassigned_batch_number}`);

    // --- 模式A产品: 直接派发 ---
    expect(ctx.productionOrderNumbersA.length, '模式A无生产单').toBeGreaterThan(0);
    const mainOrderA = ctx.productionOrderNumbersA[0];

    await submitAndApprove('production_order', mainOrderA);

    const orderA = await getOrderWithPreassignedBatch(mainOrderA);
    console.log(`[Test3] 模式A预分配批次号: ${mainOrderA}: preassigned_batch_number = "${orderA.preassigned_batch_number}"`);
    expect(!orderA.preassigned_batch_number || orderA.preassigned_batch_number === '').toBeTruthy();

    const dispatchResultA = await dispatchAndGenerateAPI([{
      production_order_number: mainOrderA,
      production_date: today,
    }]);
    console.log(`[Test3] 模式A派发结果:`, JSON.stringify(dispatchResultA)?.substring(0, 300));

    const tasksA = await getProcessTasksByOrder(mainOrderA);
    expect(tasksA.length, '模式A派发后无工序任务').toBeGreaterThan(0);
    ctx.preparationNumberA = (await getMaterialPreparationByOrder(mainOrderA))[0]?.preparation_number;

    console.log(`[Test3] ✅ 拆分+派发完成，批次号预分配验证通过`);
  });

  // ==================== Test 4: 备料领料 → 报工 → 入库 ====================
  test('4. 两产品分别完成领料→报工→入库，验证批次号格式', async () => {
    // --- 模式B产品: 110103 入库 ---
    const mainOrderB = ctx.productionOrderNumbersB[0];
    await executeProductionChain(mainOrderB, '模式B');

    const orderB = await getProductionOrderByNumber(mainOrderB);
    const batchesB = await getFinishedBatchInventory(orderB.item_number, WAREHOUSE_FINISHED);
    const batchB = batchesB.find((b: any) =>
      b.production_order_number === mainOrderB ||
      b.quantity >= Number(orderB.planned_quantity)
    );
    expect(batchB, '模式B未找到成品批次库存').toBeTruthy();
    console.log(`[Test4] 模式B入库批次号: ${batchB.batch_number}, 数量=${batchB.quantity}`);

    // 模式B批次号格式：FB-{production_number}（原始行）或 FB-{production_number}-S{nn}（拆分新行）
    expect(batchB.batch_number).toMatch(/^FB-PP-/); // 包含计划编号
    expect(batchB.batch_number).not.toMatch(/^FB-[A-Z]-\d{8}-\d{3}$/); // 不应是模式A格式
    const preassignedB = await getOrderWithPreassignedBatch(mainOrderB);
    expect(batchB.batch_number).toBe(preassignedB.preassigned_batch_number);

    // --- 模式A产品: C100809 入库 ---
    const mainOrderA = ctx.productionOrderNumbersA[0];
    await executeProductionChain(mainOrderA, '模式A');

    const orderA = await getProductionOrderByNumber(mainOrderA);
    const batchesA = await getFinishedBatchInventory(orderA.item_number, WAREHOUSE_FINISHED);
    const batchA = batchesA.find((b: any) =>
      b.production_order_number === mainOrderA ||
      b.quantity >= Number(orderA.planned_quantity)
    );
    expect(batchA, '模式A未找到成品批次库存').toBeTruthy();
    console.log(`[Test4] 模式A入库批次号: ${batchA.batch_number}, 数量=${batchA.quantity}`);

    // 模式A批次号格式：FB-{factoryCode}-{YYYYMMDD}-{NNN} 或 FB-{YYYYMMDD}-{NNN}（无工厂编码时）
    expect(batchA.batch_number).toMatch(/^FB(-[A-Z])?-\d{8}-\d{3}$/);

    const isDifferentFormat = isModeB(batchB.batch_number) !== isModeB(batchA.batch_number);
    expect(isDifferentFormat, `两种模式批次号格式应不同: B=${batchB.batch_number}, A=${batchA.batch_number}`).toBe(true);

    console.log(`[Test4] ✅ 双模式批次号验证通过:`);
    console.log(`  模式B(${ITEM_MODE_B}): ${batchB.batch_number} → 包含计划编号+拆分序号`);
    console.log(`  模式A(${ITEM_MODE_A}): ${batchA.batch_number} → 包含工厂编码+日期+序号`);
  });
});

// ==================== 辅助函数 ====================

function buildExecuteItems(details: any[]) {
  let items = details
    .filter((d: any) => d.net_requirement > 0)
    .map((d: any) => ({
      id: d.id,
      produce_quantity: d.action_type === '生产' || d.action_type === '生产+采购' ? d.net_requirement : 0,
      purchase_quantity: d.action_type === '采购' || d.action_type === '生产+采购' ? d.net_requirement : 0,
    }));

  if (items.length === 0 && details.length > 0) {
    items = details
      .filter((d: any) => d.gross_requirement > 0 || d.action_type)
      .map((d: any) => ({
        id: d.id,
        produce_quantity: (d.action_type === '生产' || d.action_type === '生产+采购') ? (d.gross_requirement || TEST_QTY) : 0,
        purchase_quantity: (d.action_type === '采购' || d.action_type === '生产+采购') ? (d.gross_requirement || 0) : 0,
      }));
  }
  return items;
}

async function getOrderWithPreassignedBatch(orderNumber: string) {
  const rows = await query<any>(
    `SELECT production_order_number, production_number, item_number, item_name,
            planned_quantity, plan_status, approval_status, inbound_status,
            preassigned_batch_number
     FROM production_order WHERE production_order_number = @id`,
    { id: { type: T.NVarChar, value: orderNumber } }
  );
  return rows[0];
}

/**
 * 报工后完成检验（如有待检验记录）
 * 报工会自动触发创建检验记录（inspect_type != 无需检时），
 * 下道工序报工前需先完成上道工序的检验，否则报工会被门控拒绝。
 */
async function completeInspectionsIfNeeded(orderNumber: string, label: string, taskNumber: string) {
  await new Promise(r => setTimeout(r, 500));

  const taskRows = await query<any>(
    `SELECT inspect_status FROM process_task WHERE process_task_number = @tn`,
    { tn: { type: T.NVarChar, value: taskNumber } }
  );
  const inspectStatus = taskRows[0]?.inspect_status;

  if (inspectStatus === '无需检' || !inspectStatus) {
    return;
  }

  if (inspectStatus === '待检验') {
    const inspections = await getProductionInspectionsByOrderAPI(orderNumber);
    const pending = (inspections || []).find((ins: any) =>
      ins.process_task_number === taskNumber && ins.status !== '检验合格' && ins.status !== '已处理'
    );
    if (pending) {
      await completeProductionInspectionAPI(pending.inspection_number);
      console.log(`[${label}] 工序${taskNumber}检验完成: ${pending.inspection_number}`);
    } else {
      await query(
        `UPDATE production_inspection SET status = N'检验合格' WHERE process_task_number = @tn AND status NOT IN (N'检验合格', N'已处理')`,
        { tn: { type: T.NVarChar, value: taskNumber } }
      );
      await query(
        `UPDATE process_task SET inspect_status = N'检验合格' WHERE process_task_number = @tn`,
        { tn: { type: T.NVarChar, value: taskNumber } }
      );
      console.log(`[${label}] 工序${taskNumber}检验完成(SQL降级)`);
    }
  }
}

/** 执行生产链：备料领料→报工→入库 */
async function executeProductionChain(orderNumber: string, label: string) {
  await batchApproveProcessTasks(orderNumber);

  const preps = await getMaterialPreparationByOrder(orderNumber);
  const prepDetails = preps[0]?.details || [];
  console.log(`[${label}] 备料明细行数: ${prepDetails.length}`);

  for (const d of prepDetails) {
    await seedMaterialInventory(
      d.material_number,
      d.default_warehouse || WAREHOUSE_RAW,
      Number(d.required_quantity) * 1.1
    );
  }

  const issueItems = prepDetails.map((d: any) => ({
    preparation_detail_id: d.id,
    material_number: d.material_number,
    actual_quantity: Number(d.required_quantity),
    warehouse_number: d.default_warehouse || WAREHOUSE_RAW,
    step_number: d.step_number,
  }));

  await createMaterialIssueAPI({
    preparation_number: preps[0].preparation_number,
    production_order_number: orderNumber,
    items: issueItems,
    remark: `E2E-${label}领料`,
  });
  console.log(`[${label}] 领料完成`);

  // 按步骤报工（每步报工后如有检验则完成检验，再报下一道工序）
  const tasks = await getProcessTasksByOrder(orderNumber);
  const today = new Date().toISOString().split('T')[0];
  for (const task of tasks) {
    await quickReportAPI({
      process_task_number: task.process_task_number,
      qualified_quantity: Number(task.planned_quantity),
      unqualified_quantity: 0,
      report_date: today,
      remark: `E2E-${label}报工`,
    });
    // 报工后完成检验（如有），确保下道工序报工不被门控拦截
    await completeInspectionsIfNeeded(orderNumber, label, task.process_task_number);
  }
  console.log(`[${label}] 报工完成, 工序数=${tasks.length}`);

  // 确认生产单已审批
  const order = await getProductionOrderByNumber(orderNumber);
  if (order.approval_status !== '已审批') {
    await submitAndApprove('production_order', orderNumber);
  }

  // 等待自动入库完成（成品类型报工完成后事件驱动自动入库）
  await new Promise(r => setTimeout(r, 2000));

  // 检查是否已自动入库
  const orderForInbound = await getProductionOrderByNumber(orderNumber);
  if (orderForInbound.inbound_status === '全部入库') {
    console.log(`[${label}] 已自动入库, 跳过手动入库`);
  } else {
    // 部分入库或未入库，手动执行入库
    await productionInboundAPI({
      warehouse_number: WAREHOUSE_FINISHED,
      warehouse_name: '成品仓',
      items: [{
        production_order_number: orderNumber,
        item_number: orderForInbound.item_number,
        item_name: orderForInbound.item_name,
        specifications: orderForInbound.specifications || '',
        basic_unit: orderForInbound.basic_unit || '',
        planned_quantity: Number(orderForInbound.planned_quantity),
        inbound_qty: Number(orderForInbound.planned_quantity),
      }],
      remark: `E2E-${label}入库`,
    });
    console.log(`[${label}] 手动入库完成`);
  }
}

function isModeB(batchNumber: string): boolean {
  // 模式A：FB-{factoryCode}-{YYYYMMDD}-{NNN} 或 FB-{YYYYMMDD}-{NNN}
  // 模式B：FB-{production_number}[-S{nn}]
  return !/^FB(-[A-Z])?-\d{8}-\d{3}$/.test(batchNumber);
}

async function cleanupOldData() {
  try {
    const plans = await query<any>(
      `SELECT production_number FROM Production_plan WHERE remark LIKE @mk OR source_order_number = N'E2E-TEST'`,
      { mk: { type: T.NVarChar, value: TEST_REMARK + '%' } }
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

async function setupBatchNumberRules() {
  const existingB = await query<any>(
    `SELECT id FROM batch_number_rule_config WHERE item_number = @item`,
    { item: { type: T.NVarChar, value: ITEM_MODE_B } }
  );
  if (existingB.length === 0) {
    const itemNameRows = await query<any>(
      `SELECT item_name FROM item_master WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: ITEM_MODE_B } }
    );
    const itemName = itemNameRows[0]?.item_name || '';
    await query(
      `INSERT INTO batch_number_rule_config (item_number, item_name, factory_id, batch_rule_mode, batch_number_template, append_split_seq, is_active, creation_man, last_updater)
       VALUES (@item, @name, NULL, N'B', N'FB-{plan_number}', 1, N'是', N'e2e', N'e2e')`,
      { item: { type: T.NVarChar, value: ITEM_MODE_B }, name: { type: T.NVarChar, value: itemName } }
    );
    const newRule = await query<any>(
      `SELECT id FROM batch_number_rule_config WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: ITEM_MODE_B } }
    );
    if (newRule[0]) ctx.ruleIds.push(newRule[0].id);
  } else {
    await query(
      `UPDATE batch_number_rule_config SET batch_rule_mode = N'B', append_split_seq = 1, is_active = N'是' WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: ITEM_MODE_B } }
    );
    if (!ctx.ruleIds.includes(existingB[0].id)) ctx.ruleIds.push(existingB[0].id);
  }
}
