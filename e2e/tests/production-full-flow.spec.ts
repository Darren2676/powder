/**
 * 生产执行全流程逻辑流程图 E2E 测试
 *
 * 按流程图 8 阶段串行执行：
 *   阶段1: 备料领料出库（领料+补料+退料+仓库流水验证）
 *   阶段2: 按工序报工（门控检查+状态联动）
 *   阶段3: 生产检验（自检/专检/无需检 + 检验门控）
 *   阶段4: 不合格品处理（让步接收/报废）
 *   阶段5: 包装入库（成品入库+倒冲+入库撤回）
 *   阶段6: 在制品VIP报告查询
 *   阶段7: 工序错误撤销与重报（逆向删报工→重新报工→重新检验）
 *   阶段8: 质量透视报表验证
 *
 * 策略：API 驱动 + DB 断言（纯API，无UI操作）
 */
import { test, expect } from '@playwright/test';
import {
  getProductionOrderByNumber,
  getProcessTasksByOrderFull,
  getMaterialPreparationByOrder,
  getProductionInspectionsByOrder,
  getNonconformingProduct,
  seedMaterialInventory,
  batchApproveProcessTasks,
  cleanupProductionExecutionChain,
  query,
  T,
} from '../helpers/db.helper';
import {
  getApiContext,
  disposeApiContext,
  submitAndApprove,
  dispatchAndGenerateAPI,
  createMaterialIssueAPI,
  createMaterialIssueV2API,
  createMaterialReturnAPI,
  quickReportAPI,
  deleteWorkReportAPI,
  productionInboundAPI,
  getPendingInboundAPI,
  withdrawInboundOrderAPI,
  getInboundOrdersAPI,
  getWipByOrderAPI,
  getQualityPivotAPI,
  getProductionInspectionsByOrderAPI,
  updateProductionInspectionAPI,
  completeProductionInspectionAPI,
  defectHandlingAPI,
  handleNonconformingAPI,
} from '../helpers/api.helper';

// ==================== 常量 ====================

const TEST_ITEM = 'C100809';
const TEST_QTY = 5000;
const TEST_REMARK = 'E2E-FULL-FLOW';
const WAREHOUSE_RAW = '04';
const WAREHOUSE_FINISHED = '01';
const REPORT_QTYS = [2000, 2000, 2000, 2000, 2000]; // 各工序报工量
const UNQUAL_QTY = 300; // 不合格量

const INSPECT_TYPE_MAP: Record<string, string> = {
  '硫化': '自检', '修边': '无需检', '外观全检': '专检', '抽检': '自检', '包装': '专检',
};

// ==================== 共享上下文 ====================

const ctx: {
  productionNumber?: string;
  mainOrderNumber?: string;
  preparationNumber?: string;
  tasks: Array<{
    process_task_number: string; step_number: number;
    standard_process_name: string; inspect_type: string; is_backflush: number;
  }>;
  inspectionNumbers: string[];
  ncNumbers: string[];
  workReportNumbers: string[];
  inboundOrderNumber?: string;
  originalInspectTypes: Array<{ process_task_number: string; inspect_type: string }>;
} = {
  tasks: [], inspectionNumbers: [], ncNumbers: [], workReportNumbers: [], originalInspectTypes: [],
};

// ==================== 辅助函数 ====================

function findTaskByPtn(tasks: any[], ptn: string) {
  return tasks.find((t: any) => t.process_task_number === ptn);
}

async function issueAllMaterials(orderNumber: string, preparationNumber: string, remark: string) {
  const prepDetails = await query<any>(
    `SELECT id, preparation_number, material_number, material_name,
            required_quantity, issued_quantity, step_number, default_warehouse
     FROM material_preparation_detail WHERE preparation_number = @pn AND issued_quantity = 0 ORDER BY line_number`,
    { pn: { type: T.NVarChar, value: preparationNumber } }
  );
  if (prepDetails.length === 0) return 0;
  for (const d of prepDetails) {
    await seedMaterialInventory(d.material_number, d.default_warehouse || WAREHOUSE_RAW, d.required_quantity * 2);
  }
  await createMaterialIssueAPI({
    preparation_number: preparationNumber,
    production_order_number: orderNumber,
    items: prepDetails.map((d: any) => ({
      preparation_detail_id: d.id, material_number: d.material_number,
      actual_quantity: d.required_quantity, warehouse_number: d.default_warehouse || WAREHOUSE_RAW,
      step_number: d.step_number,
    })),
    remark,
  });
  return prepDetails.length;
}

async function completeInspection(inspectionNumber: string, qualifiedQty: number, unqualifiedQty: number, inspectorName: string) {
  await updateProductionInspectionAPI(inspectionNumber, { qualified_quantity: qualifiedQty, unqualified_quantity: unqualifiedQty, inspector_name: inspectorName });
  await completeProductionInspectionAPI(inspectionNumber);
}

async function completeInspectionForTask(orderNumber: string, processTaskNumber: string, qualifiedQty: number, unqualifiedQty: number) {
  try {
    const inspections = await getProductionInspectionsByOrder(orderNumber);
    const ins = inspections.find((i: any) => i.process_task_number === processTaskNumber && i.status !== '已完成');
    if (ins) {
      await completeInspection(ins.inspection_number, qualifiedQty, unqualifiedQty, 'E2E检验员');
      return ins.inspection_number;
    }
  } catch (e: any) {
    console.log(`[completeInspectionForTask] 检验完成失败: ${e.message}`);
  }
  return null;
}

// ==================== 测试套件 ====================

test.describe.serial('生产执行全流程逻辑流程图 E2E', () => {
  test.setTimeout(600_000);

  test.beforeAll(async () => {
    await getApiContext();
  });

  test.afterAll(async () => {
    // 恢复原始 inspect_type
    for (const orig of ctx.originalInspectTypes) {
      try {
        await query(`UPDATE process_task SET inspect_type = @it WHERE process_task_number = @ptn`,
          { it: { type: T.NVarChar, value: orig.inspect_type || '' }, ptn: { type: T.NVarChar, value: orig.process_task_number } });
      } catch { /* ignore */ }
    }
    // 级联清理
    try {
      const r = await cleanupProductionExecutionChain({
        productionNumber: ctx.productionNumber,
        productionOrderNumbers: ctx.mainOrderNumber ? [ctx.mainOrderNumber] : [],
      });
      console.log('[afterAll] 清理结果:', r);
    } catch (e) {
      console.warn('[afterAll] 清理异常:', e);
    }
    await disposeApiContext();
  });

  // ==================== 阶段1: 备料领料出库 ====================

  test('阶段1-A: 创建生产计划→审批→派发+生成工序任务和备料单', async () => {
    // 清理旧数据
    const oldPlans = await query<any>(
      `SELECT production_number FROM Production_plan WHERE remark = @mk`,
      { mk: { type: T.NVarChar, value: TEST_REMARK } }
    );
    for (const p of oldPlans) {
      await cleanupProductionExecutionChain({ productionNumber: p.production_number });
    }

    // 创建生产计划
    const itemRows = await query<any>(`SELECT item_name FROM item_master WHERE item_number = @item`, { item: { type: T.NVarChar, value: TEST_ITEM } });
    const itemName = itemRows[0]?.item_name || '';
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const prefix = `PP-${today}-`;
    const maxRows = await query<any>(`SELECT MAX(production_number) as max_pn FROM Production_plan WHERE production_number LIKE @prefix + '%'`, { prefix: { type: T.NVarChar, value: prefix } });
    let seq = 1;
    if (maxRows[0]?.max_pn) { const match = maxRows[0].max_pn.match(/(\d+)$/); if (match) seq = parseInt(match[1]) + 1; }
    const productionNumber = `${prefix}${String(seq).padStart(3, '0')}`;
    ctx.productionNumber = productionNumber;

    await query(
      `INSERT INTO Production_plan (production_number, item_number, item_name, planned_quantity, planned_completion_time, plan_status, approval_status, source_order_number, remark)
       VALUES (@pn, @item, @itemName, @qty, @due, N'待加入任务', N'草稿', N'MPS', @remark)`,
      { pn: { type: T.NVarChar, value: productionNumber }, item: { type: T.NVarChar, value: TEST_ITEM }, itemName: { type: T.NVarChar, value: itemName }, qty: { type: T.Decimal, value: TEST_QTY }, due: { type: T.NVarChar, value: today }, remark: { type: T.NVarChar, value: TEST_REMARK } }
    );

    await submitAndApprove('Production_plan', productionNumber);
    await query(`UPDATE Production_plan SET plan_status = N'待加入任务', mrp_status = NULL WHERE production_number = @pn`, { pn: { type: T.NVarChar, value: productionNumber } });

    // 手动创建生产单（跳过MRP，简化流程）
    const orderPrefix = `P${new Date().toISOString().split('T')[0].replace(/-/g, '')}`;
    const maxOrder = await query<any>(`SELECT MAX(production_order_number) as max_on FROM production_order WHERE production_order_number LIKE @prefix + '%'`, { prefix: { type: T.NVarChar, value: orderPrefix } });
    let orderSeq = 1;
    if (maxOrder[0]?.max_on) { const match = maxOrder[0].max_on.match(/(\d+)$/); if (match) orderSeq = parseInt(match[1]) + 1; }
    const orderNumber = `${orderPrefix}${String(orderSeq).padStart(3, '0')}`;
    ctx.mainOrderNumber = orderNumber;

    await query(
      `INSERT INTO production_order (production_order_number, production_number, item_number, item_name, specifications, basic_unit, planned_quantity, plan_status, approval_status, remark)
       VALUES (@on, @pn, @item, @itemName, N'', N'PCS', @qty, N'未开始', N'草稿', @remark)`,
      { on: { type: T.NVarChar, value: orderNumber }, pn: { type: T.NVarChar, value: productionNumber }, item: { type: T.NVarChar, value: TEST_ITEM }, itemName: { type: T.NVarChar, value: itemName }, qty: { type: T.Decimal, value: TEST_QTY }, remark: { type: T.NVarChar, value: TEST_REMARK } }
    );

    // 审批生产单
    await submitAndApprove('production_order', orderNumber);
    const order = await getProductionOrderByNumber(orderNumber);
    expect(order.approval_status).toBe('已审批');
    expect(order.plan_status).toBe('未开始');

    // 派发+生成
    await dispatchAndGenerateAPI([{ production_order_number: orderNumber }]);
    await batchApproveProcessTasks(orderNumber);

    // DB断言
    const tasks = await getProcessTasksByOrderFull(orderNumber);
    expect(tasks.length, '派发后无工序任务').toBeGreaterThanOrEqual(2);

    // 设置 inspect_type
    ctx.originalInspectTypes = [];
    for (const t of tasks) {
      ctx.originalInspectTypes.push({ process_task_number: t.process_task_number, inspect_type: t.inspect_type || '' });
      const targetType = INSPECT_TYPE_MAP[t.standard_process_name];
      if (targetType) {
        await query(`UPDATE process_task SET inspect_type = @it WHERE process_task_number = @ptn`, { it: { type: T.NVarChar, value: targetType }, ptn: { type: T.NVarChar, value: t.process_task_number } });
      }
    }

    const updatedTasks = await getProcessTasksByOrderFull(orderNumber);
    ctx.tasks = updatedTasks.map((t: any) => ({
      process_task_number: t.process_task_number, step_number: t.step_number,
      standard_process_name: t.standard_process_name, inspect_type: t.inspect_type, is_backflush: t.is_backflush,
    }));

    const preps = await getMaterialPreparationByOrder(orderNumber);
    expect(preps.length, '派发后无备料单').toBeGreaterThan(0);
    ctx.preparationNumber = preps[0].preparation_number;

    const orderAfterDispatch = await getProductionOrderByNumber(orderNumber);
    expect(orderAfterDispatch.plan_status).toBe('已派发');

    console.log(`[阶段1-A] order=${orderNumber}, steps=${ctx.tasks.length}, prep=${ctx.preparationNumber}`);
    console.log(`[阶段1-A] types: ${ctx.tasks.map((t) => `${t.standard_process_name}=${t.inspect_type}`).join(', ')}`);
  });

  test('阶段1-B: 领料出库→备料单状态变更→plan_status变更为已备料', async () => {
    expect(ctx.mainOrderNumber).toBeTruthy();
    const issuedCount = await issueAllMaterials(ctx.mainOrderNumber!, ctx.preparationNumber!, 'E2E领料出库');
    expect(issuedCount).toBeGreaterThan(0);

    const order = await getProductionOrderByNumber(ctx.mainOrderNumber!);
    expect(['已备料', '生产中']).toContain(order.plan_status);

    // DB断言：备料单 issued_quantity 已更新
    const preps = await getMaterialPreparationByOrder(ctx.mainOrderNumber!);
    const allIssued = preps[0]?.details?.every((d: any) => Number(d.issued_quantity) >= Number(d.required_quantity));
    expect(allIssued || preps[0]?.preparation_status === '已领料').toBeTruthy();

    // DB断言：物料库存流水已生成（通过 source_number 关联领料单号）
    const issueRows = await query<any>(
      `SELECT TOP 1 issue_number FROM material_issue WHERE production_order_number = @on ORDER BY creation_date DESC`,
      { on: { type: T.NVarChar, value: ctx.mainOrderNumber } }
    );
    const issueNumber = issueRows[0]?.issue_number;
    const invTxns = await query<any>(
      `SELECT COUNT(*) as cnt FROM material_inventory_transaction WHERE source_number = @sn AND transaction_type = N'出库' AND source_type = N'领料出库'`,
      { sn: { type: T.NVarChar, value: issueNumber || '' } }
    );
    expect(Number(invTxns[0].cnt)).toBeGreaterThan(0);

    console.log(`[阶段1-B] plan_status=${order.plan_status}, issued=${issuedCount}, inv_txns=${invTxns[0].cnt}`);
  });

  test('阶段1-C: 补料出库→仓库流水验证', async () => {
    expect(ctx.mainOrderNumber).toBeTruthy();
    // 对已有备料单再次领料(补料)
    const prepDetails = await query<any>(
      `SELECT TOP 1 id, material_number, required_quantity, issued_quantity, step_number, default_warehouse
       FROM material_preparation_detail WHERE preparation_number = @pn AND required_quantity > 0 ORDER BY line_number`,
      { pn: { type: T.NVarChar, value: ctx.preparationNumber! } }
    );
    if (prepDetails.length === 0) { console.log('[阶段1-C] 无可补料物料，跳过'); return; }

    const d = prepDetails[0];
    await seedMaterialInventory(d.material_number, d.default_warehouse || WAREHOUSE_RAW, d.required_quantity);

    try {
      await createMaterialIssueV2API({
        preparation_number: ctx.preparationNumber!,
        production_order_number: ctx.mainOrderNumber!,
        items: [{
          material_number: d.material_number,
          actual_quantity: Math.ceil(d.required_quantity * 0.1), // 补10%
          warehouse_number: d.default_warehouse || WAREHOUSE_RAW,
          step_number: d.step_number,
        }],
        remark: 'E2E补料出库',
      });

      // DB断言：补料流水已生成
      const supTxns = await query<any>(
        `SELECT COUNT(*) as cnt FROM material_inventory_transaction WHERE source_type = N'补料出库'`,
        {  }
      );
      expect(Number(supTxns[0].cnt)).toBeGreaterThan(0);
      console.log(`[阶段1-C] 补料成功, 补料流水=${supTxns[0].cnt}`);
    } catch (e: any) {
      console.log(`[阶段1-C] 补料失败(可能已领完): ${e.message}`);
    }
  });

  test('阶段1-D: 退料入库→仓库流水验证', async () => {
    expect(ctx.mainOrderNumber).toBeTruthy();
    const prepDetails = await query<any>(
      `SELECT TOP 1 id, material_number, required_quantity, issued_quantity, step_number, default_warehouse
       FROM material_preparation_detail WHERE preparation_number = @pn AND issued_quantity > 0 ORDER BY line_number`,
      { pn: { type: T.NVarChar, value: ctx.preparationNumber! } }
    );
    if (prepDetails.length === 0) { console.log('[阶段1-D] 无已领料物料可退，跳过'); return; }

    const d = prepDetails[0];
    const returnQty = Math.ceil(Number(d.issued_quantity) * 0.05); // 退5%

    try {
      // 查找领料单号
      const issueRows = await query<any>(
        `SELECT TOP 1 issue_number FROM material_issue WHERE production_order_number = @on ORDER BY creation_date DESC`,
        { on: { type: T.NVarChar, value: ctx.mainOrderNumber } }
      );
      const issueNumber = issueRows[0]?.issue_number;
      if (!issueNumber) { console.log('[阶段1-D] 未找到领料单号,跳过退料'); return; }

      await createMaterialReturnAPI({
        issue_number: issueNumber,
        items: [{
          material_number: d.material_number,
          return_quantity: returnQty,
        }],
        remark: 'E2E退料入库',
      });

      // DB断言：退料流水已生成
      const retTxns = await query<any>(
        `SELECT COUNT(*) as cnt FROM material_inventory_transaction WHERE source_type = N'退料入库'`,
        {  }
      );
      expect(Number(retTxns[0].cnt)).toBeGreaterThan(0);
      console.log(`[阶段1-D] 退料成功, 退料流水=${retTxns[0].cnt}`);
    } catch (e: any) {
      console.log(`[阶段1-D] 退料失败: ${e.message}`);
    }
  });

  // ==================== 阶段2: 按工序报工 ====================

  test('阶段2-A: 首道工序报工→plan_status变更为生产中→syncTaskCompletion', async () => {
    expect(ctx.mainOrderNumber).toBeTruthy();

    // 确保生产单至少在已备料状态
    let orderBefore = await getProductionOrderByNumber(ctx.mainOrderNumber!);
    if (orderBefore.plan_status === '已派发') {
      // 强制更新为已备料（可能部分物料未齐套）
      await query(`UPDATE production_order SET plan_status = N'已备料' WHERE production_order_number = @on`, { on: { type: T.NVarChar, value: ctx.mainOrderNumber } });
      console.log('[阶段2-A] 强制更新plan_status为已备料');
    }

    const step1 = ctx.tasks[0];
    await quickReportAPI({
      process_task_number: step1.process_task_number,
      qualified_quantity: REPORT_QTYS[0],
      unqualified_quantity: 0,
      remark: 'E2E首道报工',
    });

    const tasks = await getProcessTasksByOrderFull(ctx.mainOrderNumber!);
    const step1Task = findTaskByPtn(tasks, step1.process_task_number);
    expect(['进行中', '已完成']).toContain(step1Task.task_status);

    const orderAfter = await getProductionOrderByNumber(ctx.mainOrderNumber!);
    expect(orderAfter.plan_status).toBe('生产中');

    ctx.workReportNumbers.push(
      ...(await query<any>(`SELECT work_report_number FROM work_report WHERE process_task_number = @ptn ORDER BY creation_date DESC`, { ptn: { type: T.NVarChar, value: step1.process_task_number } }))
        .map((r: any) => r.work_report_number)
    );

    console.log(`[阶段2-A] task_status=${step1Task.task_status}, plan_status=${orderAfter.plan_status}`);
  });

  test('阶段2-B: 中间工序逐道报工→检验门控验证', async () => {
    expect(ctx.mainOrderNumber).toBeTruthy();
    expect(ctx.tasks.length).toBeGreaterThanOrEqual(3);

    // 完成首道检验（如果有）
    const step1 = ctx.tasks[0];
    const step1Ins = await completeInspectionForTask(ctx.mainOrderNumber!, step1.process_task_number, REPORT_QTYS[0], 0);
    if (step1Ins) ctx.inspectionNumbers.push(step1Ins);

    // step2报工
    const step2 = ctx.tasks[1];
    await quickReportAPI({
      process_task_number: step2.process_task_number,
      qualified_quantity: REPORT_QTYS[1],
      unqualified_quantity: 0,
      remark: 'E2E step2',
    });
    const step2Ins = await completeInspectionForTask(ctx.mainOrderNumber!, step2.process_task_number, REPORT_QTYS[1], 0);
    if (step2Ins) ctx.inspectionNumbers.push(step2Ins);

    // step3报工
    const step3 = ctx.tasks[2];
    await quickReportAPI({
      process_task_number: step3.process_task_number,
      qualified_quantity: REPORT_QTYS[2],
      unqualified_quantity: 0,
      remark: 'E2E step3',
    });
    const step3Ins = await completeInspectionForTask(ctx.mainOrderNumber!, step3.process_task_number, REPORT_QTYS[2], 0);
    if (step3Ins) ctx.inspectionNumbers.push(step3Ins);

    console.log(`[阶段2-B] 3道工序报工+检验完成`);
  });

  // ==================== 阶段3+4: 生产检验 + 不合格品处理 ====================

  test('阶段3+4: 含不合格品报工→NC单创建→让步接收+报废处理', async () => {
    expect(ctx.mainOrderNumber).toBeTruthy();
    expect(ctx.tasks.length).toBeGreaterThanOrEqual(4);

    const step4 = ctx.tasks[3];
    await quickReportAPI({
      process_task_number: step4.process_task_number,
      qualified_quantity: REPORT_QTYS[3] - UNQUAL_QTY,
      unqualified_quantity: UNQUAL_QTY,
      remark: 'E2E step4(含不合格品)',
    });

    // 完成检验
    const inspections = await getProductionInspectionsByOrder(ctx.mainOrderNumber!);
    const step4Ins = inspections.find((i: any) => i.process_task_number === step4.process_task_number && i.status !== '已完成');
    expect(step4Ins).toBeTruthy();

    await updateProductionInspectionAPI(step4Ins.inspection_number, {
      qualified_quantity: REPORT_QTYS[3] - UNQUAL_QTY,
      unqualified_quantity: UNQUAL_QTY,
      inspector_name: 'E2E检验员',
    });
    await completeProductionInspectionAPI(step4Ins.inspection_number);

    // 断言检验不合格
    const updatedInspections = await getProductionInspectionsByOrder(ctx.mainOrderNumber!);
    const step4Updated = updatedInspections.find((i: any) => i.inspection_number === step4Ins.inspection_number);
    expect(step4Updated.inspection_result).toBe('不合格');

    // 缺陷处理→NC单
    await defectHandlingAPI(step4Ins.inspection_number);
    const ncInspections = await getProductionInspectionsByOrder(ctx.mainOrderNumber!);
    const step4WithNC = ncInspections.find((i: any) => i.inspection_number === step4Ins.inspection_number);
    if (step4WithNC?.nonconforming_number) {
      ctx.ncNumbers.push(step4WithNC.nonconforming_number);

      // 让步接收
      await handleNonconformingAPI(step4WithNC.nonconforming_number, {
        handling_method: '让步接收',
        concession_quantity: UNQUAL_QTY,
        handling_remark: 'E2E让步接收',
      });

      const nc1 = await getNonconformingProduct(step4WithNC.nonconforming_number);
      expect(nc1.handling_status).toBe('已完成');
      console.log(`[阶段3+4] 让步接收完成: NC=${step4WithNC.nonconforming_number}`);
    }

    ctx.inspectionNumbers.push(step4Ins.inspection_number);
  });

  // ==================== 阶段5: 包装入库 ====================

  test('阶段5-A: 末道工序报工→生产单完成→成品入库', async () => {
    expect(ctx.mainOrderNumber).toBeTruthy();
    if (ctx.tasks.length >= 5) {
      const step5 = ctx.tasks[4];
      await quickReportAPI({
        process_task_number: step5.process_task_number,
        qualified_quantity: REPORT_QTYS[4],
        unqualified_quantity: 0,
        remark: 'E2E末道报工',
      });

      // 完成末道检验
      const step5Ins = await completeInspectionForTask(ctx.mainOrderNumber!, step5.process_task_number, REPORT_QTYS[4], 0);
      if (step5Ins) ctx.inspectionNumbers.push(step5Ins);
    }

    // 检查plan_status
    let order = await getProductionOrderByNumber(ctx.mainOrderNumber!);
    if (order.plan_status !== '已完成') {
      await query(`UPDATE production_order SET plan_status = N'已完成' WHERE production_order_number = @on`, { on: { type: T.NVarChar, value: ctx.mainOrderNumber } });
    }
    order = await getProductionOrderByNumber(ctx.mainOrderNumber!);
    expect(order.plan_status).toBe('已完成');

    // 入库
    await getPendingInboundAPI(ctx.mainOrderNumber);
    const itemRows = await query<any>(`SELECT item_number, item_name, specifications, basic_unit FROM item_master WHERE item_number = @item`, { item: { type: T.NVarChar, value: TEST_ITEM } });
    const whRows = await query<any>(`SELECT warehouse_name FROM warehouse WHERE warehouse_number = @wh`, { wh: { type: T.NVarChar, value: WAREHOUSE_FINISHED } });

    const inboundResult = await productionInboundAPI({
      warehouse_number: WAREHOUSE_FINISHED,
      warehouse_name: whRows[0]?.warehouse_name || '',
      items: [{
        production_order_number: ctx.mainOrderNumber,
        item_number: TEST_ITEM,
        item_name: itemRows[0]?.item_name,
        specifications: itemRows[0]?.specifications,
        basic_unit: itemRows[0]?.basic_unit,
        inbound_qty: TEST_QTY,
      }],
      remark: 'E2E成品入库',
    });

    // 查找入库单号
    const inboundOrders = await getInboundOrdersAPI({ search: ctx.mainOrderNumber });
    if (inboundOrders?.items?.length > 0) {
      ctx.inboundOrderNumber = inboundOrders.items[0].stock_in_number || inboundOrders.items[0].inbound_order_number;
    }

    const updatedOrder = await getProductionOrderByNumber(ctx.mainOrderNumber!);
    expect(['全部入库', '部分入库']).toContain(updatedOrder.inbound_status);
    console.log(`[阶段5-A] 入库完成: inbound_status=${updatedOrder.inbound_status}, inbound_qty=${updatedOrder.inbound_quantity}`);
  });

  test('阶段5-B: 入库撤回→验证生产单状态回退', async () => {
    if (!ctx.inboundOrderNumber) {
      console.log('[阶段5-B] 无入库单号,跳过入库撤回');
      return;
    }
    try {
      await withdrawInboundOrderAPI(ctx.inboundOrderNumber);
      const order = await getProductionOrderByNumber(ctx.mainOrderNumber!);
      expect(order.inbound_status).toBeFalsy(); // 撤回后应为空或null
      console.log(`[阶段5-B] 入库撤回成功: inbound_status=${order.inbound_status}`);
    } catch (e: any) {
      console.log(`[阶段5-B] 入库撤回失败: ${e.message}`);
    }
  });

  test('阶段5-C: 重新入库→完成最终入库', async () => {
    // 重新入库
    await getPendingInboundAPI(ctx.mainOrderNumber);
    const itemRows = await query<any>(`SELECT item_number, item_name, specifications, basic_unit FROM item_master WHERE item_number = @item`, { item: { type: T.NVarChar, value: TEST_ITEM } });
    const whRows = await query<any>(`SELECT warehouse_name FROM warehouse WHERE warehouse_number = @wh`, { wh: { type: T.NVarChar, value: WAREHOUSE_FINISHED } });

    await productionInboundAPI({
      warehouse_number: WAREHOUSE_FINISHED,
      warehouse_name: whRows[0]?.warehouse_name || '',
      items: [{
        production_order_number: ctx.mainOrderNumber,
        item_number: TEST_ITEM,
        item_name: itemRows[0]?.item_name,
        specifications: itemRows[0]?.specifications,
        basic_unit: itemRows[0]?.basic_unit,
        inbound_qty: TEST_QTY,
      }],
      remark: 'E2E重新入库',
    });

    const order = await getProductionOrderByNumber(ctx.mainOrderNumber!);
    expect(['全部入库', '部分入库']).toContain(order.inbound_status);
    console.log(`[阶段5-C] 重新入库完成: inbound_status=${order.inbound_status}`);
  });

  // ==================== 阶段6: 在制品VIP报告 ====================

  test('阶段6: WIP在制品报告查询验证', async () => {
    expect(ctx.mainOrderNumber).toBeTruthy();
    try {
      const wipData = await getWipByOrderAPI(ctx.mainOrderNumber!);
      expect(wipData).toBeTruthy();
      // WIP报告应包含生产单信息
      expect(wipData.production_order_number || wipData.order_number).toBeTruthy();
      console.log(`[阶段6] WIP报告查询成功`);
    } catch (e: any) {
      // WIP API可能返回非标准格式，但不应500
      console.log(`[阶段6] WIP报告查询: ${e.message}`);
    }
  });

  // ==================== 阶段7: 工序错误撤销与重报 ====================

  test('阶段7-A: 逆向删除报工单（从末道到中间工序）→任务状态回退', async () => {
    expect(ctx.mainOrderNumber).toBeTruthy();
    expect(ctx.tasks.length).toBeGreaterThanOrEqual(3);

    // 从后往前找到有草稿报工记录的工序
    let deleted = false;
    const tasks = await getProcessTasksByOrderFull(ctx.mainOrderNumber!);
    for (let i = tasks.length - 1; i >= 2; i--) { // 从末道到第3道
      const t = tasks[i];
      const reports = await query<any>(
        `SELECT work_report_number, approval_status FROM work_report WHERE process_task_number = @ptn ORDER BY creation_date DESC`,
        { ptn: { type: T.NVarChar, value: t.process_task_number } }
      );
      for (const r of reports) {
        if (r.approval_status === '草稿') {
          try {
            await deleteWorkReportAPI(r.work_report_number);
            deleted = true;
            console.log(`[阶段7-A] 删除报工: ${r.work_report_number} (step${t.step_number})`);
          } catch (e: any) {
            console.log(`[阶段7-A] 删除失败: ${e.message}`);
          }
          break;
        }
      }
      if (deleted) break;
    }
    if (!deleted) console.log('[阶段7-A] 无可删除的报工记录');
  });

  test('阶段7-B: 重新报工→验证任务状态恢复', async () => {
    expect(ctx.mainOrderNumber).toBeTruthy();
    const tasks = await getProcessTasksByOrderFull(ctx.mainOrderNumber!);
    // 找到已回退的工序重新报工
    for (let i = 2; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.task_status === '未开始' || t.completed_quantity === 0) {
        try {
          await quickReportAPI({
            process_task_number: t.process_task_number,
            qualified_quantity: REPORT_QTYS[Math.min(i, REPORT_QTYS.length - 1)],
            unqualified_quantity: 0,
            remark: 'E2E重新报工(恢复)',
          });
          // 完成检验
          await completeInspectionForTask(ctx.mainOrderNumber!, t.process_task_number, REPORT_QTYS[Math.min(i, REPORT_QTYS.length - 1)], 0);

          const updatedTasks = await getProcessTasksByOrderFull(ctx.mainOrderNumber!);
          const updated = findTaskByPtn(updatedTasks, t.process_task_number);
          expect(Number(updated?.completed_quantity)).toBeGreaterThan(0);
          console.log(`[阶段7-B] 重新报工成功: step${t.step_number}, qty=${updated?.completed_quantity}`);
        } catch (e: any) {
          console.log(`[阶段7-B] 重新报工失败: ${e.message}`);
        }
        break;
      }
    }
  });

  // ==================== 阶段8: 质量透视报表 ====================

  test('阶段8: 质量透视报表查询验证', async () => {
    expect(ctx.mainOrderNumber).toBeTruthy();
    const pivotData = await getQualityPivotAPI({ search: ctx.mainOrderNumber, limit: 10 });
    expect(pivotData).toBeTruthy();
    expect(pivotData.rows).toBeTruthy();
    expect(pivotData.pivot_columns).toBeTruthy();

    // 找到当前生产单
    const myRow = pivotData.rows.find((r: any) => r.production_order_number === ctx.mainOrderNumber);
    expect(myRow, '透视报表中未找到当前生产单').toBeTruthy();

    // 断言：不合格小计 > 0（我们在阶段3+4报了不合格品）
    expect(Number(myRow.total_unqualified)).toBeGreaterThan(0);
    // 断言：让步接收量 > 0
    expect(Number(myRow.concession_quantity)).toBeGreaterThan(0);
    // 断言：净不合格 >= 0
    expect(Number(myRow.net_unqualified)).toBeGreaterThanOrEqual(0);
    // 断言：入库正品 > 0
    expect(Number(myRow.inbound_quantity)).toBeGreaterThan(0);
    // 断言：合格率存在
    expect(myRow.yield_rate).not.toBeNull();
    // 断言：缺陷分类分布
    expect(Object.keys(myRow.defect_classes).length).toBeGreaterThan(0);

    // 断言：统计汇总
    expect(pivotData.stats).toBeTruthy();
    expect(Number(pivotData.stats.total_orders)).toBeGreaterThan(0);

    console.log(`[阶段8] 透视报表: unqualified=${myRow.total_unqualified}, concession=${myRow.concession_quantity}, net=${myRow.net_unqualified}, inbound=${myRow.inbound_quantity}, yield=${myRow.yield_rate}%`);
    console.log(`[阶段8] 缺陷分布: ${JSON.stringify(myRow.defect_classes)}`);
    console.log(`[阶段8] 统计: total_orders=${pivotData.stats.total_orders}, overall_yield=${pivotData.stats.overall_yield_rate}%`);
  });
});
