/**
 * 计划管理-MRP运算逻辑流程 — 多工厂数据隔离 E2E 测试
 *
 * 覆盖 MRP 运算逻辑全流程 factory_id 传递和隔离：
 *
 *   Production_plan(factory_id) → getPlansForMrp(factory_id过滤)
 *     → runMRP(factory_id → mrp_run.factory_id + mrp_run_plan.factory_id + mrp_run_detail)
 *       → BFS BOM分解：Level0=生产, Level1+=按business_scope决策
 *         → net_requirement计算（库存/在制品/在途采购/待执行PR）
 *       → getMRPRuns(factory_id过滤)
 *       → getMRPRunDetail(跨工厂404)
 *       → executeMRP(factory_id → production_order + purchase_req + plan_import)
 *       → cancelMRPRun(跨工厂404/400)
 *       → deleteMRPRun(跨工厂404/400)
 *
 * 双工厂测试: 宁国(factory_id=14) + 广州(factory_id=15)
 *
 * 测试重点:
 *   1. MRP运算BFS BOM分解逻辑 + factory_id 传递
 *   2. mrp_run/mrp_run_detail/mrp_run_plan factory_id 写入
 *   3. MRP运算结果中 Level0 action_type='生产', Level1+按business_scope判断
 *   4. 净需求计算数据隔离（库存查询不含跨工厂数据）
 *   5. MRP执行 → 生产单/采购申请 factory_id 传递
 *   6. 生产计划 mrp_status 更新 + plan_status 变更隔离
 *   7. MRP取消/删除 防越权
 *   8. 全链路 factory_id 一致性
 */
import { test, expect } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import { apiLogin, getApiContext, disposeApiContext } from '../helpers/api.helper';

const API_BASE = 'http://localhost:3000/api/v1';
const FACTORY_N_ID = 14;
const FACTORY_G_ID = 15;

const TEST_FG   = 'MRP-L-FG';    // 成品 (business_scope='生产')
const TEST_RM   = 'MRP-L-RM';    // 原材料 (business_scope='采购')
const TEST_SEMI = 'MRP-L-SEMI';  // 半成品 (business_scope='生产,采购') — 双源物料

// ==================== 工厂隔离 API 辅助 ====================

async function facPost(path: string, facId: number, data: any) {
  const ctx = await getApiContext();
  return ctx.post(`${API_BASE}${path}`, {
    headers: { 'x-factory-id': String(facId) },
    data,
  });
}

async function facGet(path: string, facId: number) {
  const ctx = await getApiContext();
  return ctx.get(`${API_BASE}${path}`, { headers: { 'x-factory-id': String(facId) } });
}

// ==================== DB 辅助 ====================

async function getMrpRun(runNumber: string) {
  const rows = await query<any>(
    `SELECT mrp_run_number, run_status, plan_count, result_count, factory_id,
            production_order_count, purchase_req_count
     FROM mrp_run WHERE mrp_run_number = @no`,
    { no: { type: T.NVarChar, value: runNumber } }
  );
  return rows[0] || null;
}

async function getMrpRunDetails(runNumber: string) {
  return await query<any>(
    `SELECT id, bom_level, item_number, item_name, item_type, business_scope,
            action_type, result_status, gross_requirement, net_requirement,
            produce_quantity, purchase_quantity, source_production_number, parent_item_number,
            factory_id
     FROM mrp_run_detail WHERE mrp_run_number = @no ORDER BY bom_level, id`,
    { no: { type: T.NVarChar, value: runNumber } }
  );
}

async function getMrpRunPlans(runNumber: string) {
  return await query<any>(
    `SELECT mrp_run_number, production_number, item_number, factory_id
     FROM mrp_run_plan WHERE mrp_run_number = @no`,
    { no: { type: T.NVarChar, value: runNumber } }
  );
}

// ==================== 共享状态 ====================
const S: any = {};

// ==================== 种子数据 ====================

async function seedData() {
  // 1. 成品物料 (business_scope='生产')
  const fgExist = await query<any>(
    `SELECT item_number FROM item_master WHERE item_number = @no`,
    { no: { type: T.NVarChar, value: TEST_FG } }
  );
  if (!fgExist.length) {
    await query(`
      INSERT INTO item_master (item_number, item_name, item_type, business_scope, basic_unit, specifications, lead_time_days, creation_date)
      VALUES (@item, N'MRP逻辑-成品', N'成品', N'生产', N'个', N'MRP逻辑测试', 3, GETDATE())
    `, { item: { type: T.NVarChar, value: TEST_FG } });
  }

  // 2. 原材料 (business_scope='采购')
  const rmExist = await query<any>(
    `SELECT item_number FROM item_master WHERE item_number = @no`,
    { no: { type: T.NVarChar, value: TEST_RM } }
  );
  if (!rmExist.length) {
    await query(`
      INSERT INTO item_master (item_number, item_name, item_type, business_scope, basic_unit, specifications, lead_time_days, creation_date)
      VALUES (@item, N'MRP逻辑-原材料', N'原材料', N'采购', N'个', N'MRP逻辑测试', 5, GETDATE())
    `, { item: { type: T.NVarChar, value: TEST_RM } });
  }

  // 3. 半成品 (business_scope='生产,采购') — 双源
  const semiExist = await query<any>(
    `SELECT item_number FROM item_master WHERE item_number = @no`,
    { no: { type: T.NVarChar, value: TEST_SEMI } }
  );
  if (!semiExist.length) {
    await query(`
      INSERT INTO item_master (item_number, item_name, item_type, business_scope, basic_unit, specifications, lead_time_days, creation_date)
      VALUES (@item, N'MRP逻辑-半成品', N'半成品', N'生产,采购', N'个', N'MRP逻辑测试', 4, GETDATE())
    `, { item: { type: T.NVarChar, value: TEST_SEMI } });
  }

  // 4. BOM: 成品 → 半成品 + 原材料
  const bomFG = 'BOM-MRP-L-FG';
  const bomFGExist = await query<any>(
    `SELECT bom_number FROM bom_header WHERE bom_number = @no`,
    { no: { type: T.NVarChar, value: bomFG } }
  );
  if (!bomFGExist.length) {
    await query(`
      INSERT INTO bom_header (bom_number, bom_name, item_number, item_name, bom_version, bom_type, base_quantity, base_unit, [condition], approval_status, creation_date, creation_man)
      VALUES (@bn, N'MRP逻辑-成品BOM', @item, N'MRP逻辑-成品', N'V1', N'制造BOM', 1, N'个', N'启用', N'已审批', GETDATE(), N'E2E')
    `, { bn: { type: T.NVarChar, value: bomFG }, item: { type: T.NVarChar, value: TEST_FG } });

    // 明细行1: 半成品(2个/成品)
    await query(`
      INSERT INTO bom_detail (bom_number, line_number, material_number, material_name, material_type, standard_quantity, unit, wastage_rate, actual_quantity, is_key_material, supply_type, default_warehouse, remark)
      VALUES (@bn, 10, @mat, N'MRP逻辑-半成品', N'半成品', 2, N'个', 0, 2, 0, N'生产', '', '')
    `, { bn: { type: T.NVarChar, value: bomFG }, mat: { type: T.NVarChar, value: TEST_SEMI } });

    // 明细行2: 原材料(5个/成品)
    await query(`
      INSERT INTO bom_detail (bom_number, line_number, material_number, material_name, material_type, standard_quantity, unit, wastage_rate, actual_quantity, is_key_material, supply_type, default_warehouse, remark)
      VALUES (@bn, 20, @mat, N'MRP逻辑-原材料', N'原材料', 5, N'个', 0, 5, 0, N'采购', '', '')
    `, { bn: { type: T.NVarChar, value: bomFG }, mat: { type: T.NVarChar, value: TEST_RM } });
  }

  // 5. BOM: 半成品 → 原材料 (半成品也需要原材料)
  const bomSemi = 'BOM-MRP-L-SEMI';
  const bomSemiExist = await query<any>(
    `SELECT bom_number FROM bom_header WHERE bom_number = @no`,
    { no: { type: T.NVarChar, value: bomSemi } }
  );
  if (!bomSemiExist.length) {
    await query(`
      INSERT INTO bom_header (bom_number, bom_name, item_number, item_name, bom_version, bom_type, base_quantity, base_unit, [condition], approval_status, creation_date, creation_man)
      VALUES (@bn, N'MRP逻辑-半成品BOM', @item, N'MRP逻辑-半成品', N'V1', N'制造BOM', 1, N'个', N'启用', N'已审批', GETDATE(), N'E2E')
    `, { bn: { type: T.NVarChar, value: bomSemi }, item: { type: T.NVarChar, value: TEST_SEMI } });

    // 明细行: 半成品需要3个原材料
    await query(`
      INSERT INTO bom_detail (bom_number, line_number, material_number, material_name, material_type, standard_quantity, unit, wastage_rate, actual_quantity, is_key_material, supply_type, default_warehouse, remark)
      VALUES (@bn, 10, @mat, N'MRP逻辑-原材料', N'原材料', 3, N'个', 0, 3, 0, N'采购', '', '')
    `, { bn: { type: T.NVarChar, value: bomSemi }, mat: { type: T.NVarChar, value: TEST_RM } });
  }

  // 6. 宁国生产计划（已审批+待加入任务+mrp_status=NULL）
  const planPrefix = 'PP-ML-N-';
  S.planN = planPrefix + Date.now();
  const planNExist = await query<any>(
    `SELECT production_number FROM Production_plan WHERE production_number = @no`,
    { no: { type: T.NVarChar, value: S.planN } }
  );
  if (!planNExist.length) {
    await query(`
      INSERT INTO Production_plan (production_number, item_number, item_name, basic_unit, specifications,
        planned_quantity, planned_completion_time, plan_status, approval_status, mrp_status, factory_id)
      VALUES (@pn, @item, N'MRP逻辑-成品', N'个', N'MRP逻辑测试',
        100, DATEADD(day, 30, GETDATE()), N'待加入任务', N'已审批', NULL, @facId)
    `, { pn: { type: T.NVarChar, value: S.planN }, item: { type: T.NVarChar, value: TEST_FG }, facId: { type: T.Int, value: FACTORY_N_ID } });
  }

  // 7. 广州生产计划
  const planPrefixG = 'PP-ML-G-';
  S.planG = planPrefixG + Date.now();
  const planGExist = await query<any>(
    `SELECT production_number FROM Production_plan WHERE production_number = @no`,
    { no: { type: T.NVarChar, value: S.planG } }
  );
  if (!planGExist.length) {
    await query(`
      INSERT INTO Production_plan (production_number, item_number, item_name, basic_unit, specifications,
        planned_quantity, planned_completion_time, plan_status, approval_status, mrp_status, factory_id)
      VALUES (@pn, @item, N'MRP逻辑-成品', N'个', N'MRP逻辑测试',
        80, DATEADD(day, 30, GETDATE()), N'待加入任务', N'已审批', NULL, @facId)
    `, { pn: { type: T.NVarChar, value: S.planG }, item: { type: T.NVarChar, value: TEST_FG }, facId: { type: T.Int, value: FACTORY_G_ID } });
  }

  S.bomFG = bomFG;
  S.bomSemi = bomSemi;
  console.log(`  种子数据: 计划宁国=${S.planN}, 计划广州=${S.planG}`);
}

// ==================== 清理 ====================

async function cleanupAll() {
  // 清理采购申请
  await query(`DELETE FROM purchase_req_detail WHERE purchase_req_number LIKE 'PRN-%' OR purchase_req_number LIKE 'PRG-%'`);
  await query(`DELETE FROM purchase_req WHERE source_number LIKE 'MRPN-%' OR source_number LIKE 'MRPG-%'`);

  // 清理生产单
  await query(`DELETE FROM production_order WHERE production_number LIKE 'PP-ML-N-%' OR production_number LIKE 'PP-ML-G-%'`);
  await query(`DELETE FROM production_order WHERE remark LIKE N'%MRP自动生成%MRPN-%' OR remark LIKE N'%MRP自动生成%MRPG-%'`);

  // 清理MRP
  await query(`DELETE FROM mrp_run_detail WHERE mrp_run_number LIKE 'MRPN-%' OR mrp_run_number LIKE 'MRPG-%'`);
  await query(`DELETE FROM mrp_run_plan WHERE mrp_run_number LIKE 'MRPN-%' OR mrp_run_number LIKE 'MRPG-%'`);
  await query(`DELETE FROM mrp_run WHERE mrp_run_number LIKE 'MRPN-%' OR mrp_run_number LIKE 'MRPG-%'`);

  // 清理生产计划
  await query(`DELETE FROM Production_plan WHERE production_number LIKE 'PP-ML-%'`);

  // 清理BOM
  await query(`DELETE FROM bom_detail WHERE bom_number = @bn`, { bn: { type: T.NVarChar, value: 'BOM-MRP-L-FG' } });
  await query(`DELETE FROM bom_header WHERE bom_number = @bn`, { bn: { type: T.NVarChar, value: 'BOM-MRP-L-FG' } });
  await query(`DELETE FROM bom_detail WHERE bom_number = @bn`, { bn: { type: T.NVarChar, value: 'BOM-MRP-L-SEMI' } });
  await query(`DELETE FROM bom_header WHERE bom_number = @bn`, { bn: { type: T.NVarChar, value: 'BOM-MRP-L-SEMI' } });

  // 清理物料
  await query(`DELETE FROM item_master WHERE item_number = @item`, { item: { type: T.NVarChar, value: TEST_FG } });
  await query(`DELETE FROM item_master WHERE item_number = @item`, { item: { type: T.NVarChar, value: TEST_RM } });
  await query(`DELETE FROM item_master WHERE item_number = @item`, { item: { type: T.NVarChar, value: TEST_SEMI } });
}

// ==================== 测试 ====================

test.describe.serial('计划管理-MRP运算逻辑流程 多工厂数据隔离', () => {

  // ========== 0. 初始化 ==========

  test('0.1 登录 + 种子数据', async () => {
    await apiLogin('admin', 'admin123');
    await seedData();
  });

  // ========== 1. 生产计划 factory_id ==========

  test('1.1 宁国生产计划 factory_id=14', async () => {
    const rows = await query<any>(
      `SELECT production_number, factory_id, approval_status, plan_status, mrp_status FROM Production_plan WHERE production_number = @no`,
      { no: { type: T.NVarChar, value: S.planN } }
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].factory_id).toBe(FACTORY_N_ID);
    expect(rows[0].approval_status).toBe('已审批');
    expect(rows[0].plan_status).toBe('待加入任务');
    expect(rows[0].mrp_status).toBeNull();
  });

  test('1.2 广州生产计划 factory_id=15', async () => {
    const rows = await query<any>(
      `SELECT production_number, factory_id FROM Production_plan WHERE production_number = @no`,
      { no: { type: T.NVarChar, value: S.planG } }
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].factory_id).toBe(FACTORY_G_ID);
  });

  // ========== 2. getPlansForMrp factory_id 隔离 ==========

  test('2.1 宁国MRP可运算列表不含广州计划', async () => {
    const res = await facGet(`/mrp/plans-for-mrp?search=${S.planG}`, FACTORY_N_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data || [];
    const found = items.find((i: any) => i.production_number === S.planG);
    expect(found).toBeFalsy();
  });

  test('2.2 广州MRP可运算列表不含宁国计划', async () => {
    const res = await facGet(`/mrp/plans-for-mrp?search=${S.planN}`, FACTORY_G_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data || [];
    const found = items.find((i: any) => i.production_number === S.planN);
    expect(found).toBeFalsy();
  });

  // ========== 3. runMRP — BFS BOM分解 + factory_id ==========

  test('3.1 宁国MRP运算 → mrp_run.factory_id=14', async () => {
    const res = await facPost('/mrp/run', FACTORY_N_ID, {
      production_numbers: [S.planN],
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    S.mrpRunN = body?.data?.mrp_run_number;
    expect(S.mrpRunN).toBeTruthy();

    // mrp_run.factory_id
    const run = await getMrpRun(S.mrpRunN);
    expect(run).toBeTruthy();
    expect(run.factory_id).toBe(FACTORY_N_ID);
    expect(run.run_status).toBe('已计算');
    console.log(`  宁国MRP运行: ${S.mrpRunN}, factory_id=${run.factory_id}, result_count=${run.result_count}`);
  });

  // ========== 4. mrp_run_detail BFS分解逻辑 ==========

  test('4.1 Level0 成品 action_type=生产, Level1+按business_scope决策', async () => {
    const details = await getMrpRunDetails(S.mrpRunN);
    console.log(`  MRP明细行: ${details.length}`);
    // Level 0: 成品 → action_type='生产'
    const level0 = details.filter(d => d.bom_level === 0);
    expect(level0.length).toBeGreaterThanOrEqual(1);
    for (const d of level0) {
      expect(d.action_type, `Level0 ${d.item_number} action_type应为生产`).toBe('生产');
      expect(d.produce_quantity, `Level0 ${d.item_number} produce_quantity应为净需求`).toBeGreaterThan(0);
      expect(d.purchase_quantity, `Level0 ${d.item_number} purchase_quantity应为0`).toBe(0);
    }

    // Level 1: 半成品(business_scope='生产,采购') → action_type='生产+采购'
    const level1 = details.filter(d => d.bom_level === 1);
    const semiRow = level1.find(d => d.item_number === TEST_SEMI);
    if (semiRow) {
      expect(semiRow.action_type, `半成品 action_type应为 生产+采购`).toBe('生产+采购');
      // 双源物料: MRP计算阶段 produce_quantity=netReq, purchase_quantity=0
      // 执行确认时才由用户决策分配采购数量
      expect(semiRow.produce_quantity, '半成品 produce_quantity应>0(默认全部生产)').toBeGreaterThan(0);
      expect(semiRow.purchase_quantity, '双源物料计算阶段 purchase_quantity=0(待执行时决策)').toBe(0);
      console.log(`  半成品: action_type=${semiRow.action_type}, produce=${semiRow.produce_quantity}, purchase=${semiRow.purchase_quantity}(双源-待执行时分配)`);
    }

    // Level 1: 原材料(business_scope='采购') → action_type='采购'
    const rmRow = level1.find(d => d.item_number === TEST_RM);
    if (rmRow) {
      expect(rmRow.action_type, `原材料 action_type应为采购`).toBe('采购');
      expect(rmRow.purchase_quantity, '原材料 purchase_quantity应>0').toBeGreaterThan(0);
      expect(rmRow.produce_quantity, '原材料 produce_quantity应为0').toBe(0);
    }
  });

  // ========== 5. mrp_run_detail factory_id ==========

  test('5.1 mrp_run_detail factory_id=14', async () => {
    const details = await getMrpRunDetails(S.mrpRunN);
    for (const d of details) {
      expect(d.factory_id, `detail ${d.item_number} factory_id应为14`).toBe(FACTORY_N_ID);
    }
  });

  // ========== 6. mrp_run_plan factory_id ==========

  test('6.1 mrp_run_plan factory_id=14', async () => {
    const plans = await getMrpRunPlans(S.mrpRunN);
    expect(plans.length).toBeGreaterThanOrEqual(1);
    for (const p of plans) {
      expect(p.factory_id, `mrp_run_plan factory_id应为14`).toBe(FACTORY_N_ID);
    }
  });

  // ========== 7. getMRPRuns factory_id 隔离 ==========

  test('7.1 广州MRP列表不含宁国MRP运行', async () => {
    const res = await facGet(`/mrp/?search=${S.mrpRunN}`, FACTORY_G_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const found = items.find((i: any) => i.mrp_run_number === S.mrpRunN);
    expect(found).toBeFalsy();
  });

  // ========== 8. getMRPRunDetail 防越权 ==========

  test('8.1 广州查看宁国MRP详情 → 404', async () => {
    const res = await facGet(`/mrp/${encodeURIComponent(S.mrpRunN)}`, FACTORY_G_ID);
    expect(res.status()).toBe(404);
  });

  // ========== 9. 广州MRP运算 ==========

  test('9.1 广州MRP运算 → mrp_run.factory_id=15', async () => {
    const res = await facPost('/mrp/run', FACTORY_G_ID, {
      production_numbers: [S.planG],
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    S.mrpRunG = body?.data?.mrp_run_number;
    expect(S.mrpRunG).toBeTruthy();

    const run = await getMrpRun(S.mrpRunG);
    expect(run.factory_id).toBe(FACTORY_G_ID);
    console.log(`  广州MRP运行: ${S.mrpRunG}, factory_id=${run.factory_id}`);
  });

  // ========== 10. 广州mrp_run_detail factory_id ==========

  test('10.1 广州mrp_run_detail factory_id=15', async () => {
    const details = await getMrpRunDetails(S.mrpRunG);
    for (const d of details) {
      expect(d.factory_id, `广州detail ${d.item_number} factory_id应为15`).toBe(FACTORY_G_ID);
    }
  });

  // ========== 11. 宁国MRP执行 → factory_id 传递 ==========

  test('11.1 宁国MRP执行 → 生产单+采购申请 factory_id=14', async () => {
    // 获取MRP详情
    const detailRes = await facGet(`/mrp/${encodeURIComponent(S.mrpRunN)}`, FACTORY_N_ID);
    expect(detailRes.ok()).toBeTruthy();
    const detailBody = await detailRes.json();
    const details = detailBody?.data?.details || [];

    // 构建execute items：全部按MRP建议数量确认
    // 对双源物料(半成品): 用户可决定分配，本测试默认全部按生产
    const items = details.map((d: any) => ({
      id: d.id,
      produce_quantity: d.produce_quantity || d.net_requirement || 0,
      purchase_quantity: d.purchase_quantity || 0,
    }));

    const execRes = await facPost('/mrp/execute', FACTORY_N_ID, {
      mrp_run_number: S.mrpRunN,
      items,
    });
    if (!execRes.ok()) {
      const errText = await execRes.text().catch(() => '');
      console.log(`  MRP执行失败(${execRes.status()}): ${errText}`);
    }
    expect(execRes.ok()).toBeTruthy();
    const execBody = await execRes.json();
    console.log(`  宁国MRP执行: 生产单=${execBody?.data?.production_order_count}, 采购申请=${execBody?.data?.purchase_req_count}, 计划导入=${execBody?.data?.plan_import_count}`);

    // mrp_run状态
    const run = await getMrpRun(S.mrpRunN);
    expect(run.run_status).toBe('已确认');

    // 生产单 factory_id
    const prodOrders = await query<any>(
      `SELECT production_order_number, item_number, factory_id FROM production_order WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: S.planN } }
    );
    for (const po of prodOrders) {
      expect(po.factory_id, `生产单 ${po.production_order_number} factory_id应为14`).toBe(FACTORY_N_ID);
    }

    // 采购申请 factory_id
    const prRows = await query<any>(
      `SELECT purchase_req_number, factory_id FROM purchase_req WHERE source_number = @sn`,
      { sn: { type: T.NVarChar, value: S.mrpRunN } }
    );
    for (const pr of prRows) {
      expect(pr.factory_id, `采购申请 ${pr.purchase_req_number} factory_id应为14`).toBe(FACTORY_N_ID);
    }
    if (prRows.length > 0) S.prN = prRows[0].purchase_req_number;
  });

  // ========== 12. 生产计划 mrp_status/plan_status 变更 ==========

  test('12.1 宁国计划 mrp_status=已分解, plan_status保持待加入任务(BFS已创建成品生产单)', async () => {
    const rows = await query<any>(
      `SELECT production_number, mrp_status, plan_status, factory_id FROM Production_plan WHERE production_number = @no`,
      { no: { type: T.NVarChar, value: S.planN } }
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].mrp_status, '宁国计划 mrp_status应为已分解').toBe('已分解');
    // MRP执行时BFS分解已为成品创建生产单(production_number=PP-ML-N-xxx, item_number=MRP-L-FG)
    // 计划导入阶段检测到已存在生产单后跳过，planImportCount=0，plan_status不被更新
    expect(rows[0].plan_status, '宁国计划 plan_status仍为待加入任务(BFS已创建成品生产单)').toBe('待加入任务');
    expect(rows[0].factory_id, '宁国计划 factory_id仍为14').toBe(FACTORY_N_ID);
  });

  // ========== 13. 广州计划不受宁国MRP影响 ==========

  test('13.1 广州计划 mrp_status仍为NULL', async () => {
    const rows = await query<any>(
      `SELECT production_number, mrp_status, plan_status FROM Production_plan WHERE production_number = @no`,
      { no: { type: T.NVarChar, value: S.planG } }
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].mrp_status, '广州计划 mrp_status应仍为NULL').toBeNull();
  });

  // ========== 14. MRP取消 防越权 ==========

  test('14.1 广州取消宁国MRP → 404或400', async () => {
    // 先创建一个新的宁国MRP运行供测试取消
    const newPlanPrefix = 'PP-ML-N2-';
    const newPlan = newPlanPrefix + Date.now();
    await query(`
      INSERT INTO Production_plan (production_number, item_number, item_name, basic_unit, specifications,
        planned_quantity, planned_completion_time, plan_status, approval_status, mrp_status, factory_id)
      VALUES (@pn, @item, N'MRP逻辑-成品', N'个', N'MRP逻辑测试',
        50, DATEADD(day, 30, GETDATE()), N'待加入任务', N'已审批', NULL, @facId)
    `, { pn: { type: T.NVarChar, value: newPlan }, item: { type: T.NVarChar, value: TEST_FG }, facId: { type: T.Int, value: FACTORY_N_ID } });

    // 运行MRP
    const runRes = await facPost('/mrp/run', FACTORY_N_ID, {
      production_numbers: [newPlan],
    });
    expect(runRes.ok()).toBeTruthy();
    const runBody = await runRes.json();
    const cancelTarget = runBody?.data?.mrp_run_number;

    // 广州尝试取消宁国的MRP运行 → 应404(不存在)或400(状态不允许)
    const cancelRes = await facPost(`/mrp/${encodeURIComponent(cancelTarget)}/cancel`, FACTORY_G_ID, {});
    expect(cancelRes.status(), '跨工厂取消MRP应被拒绝').toBeGreaterThanOrEqual(400);

    // 宁国可以取消自己的MRP运行
    const cancelResN = await facPost(`/mrp/${encodeURIComponent(cancelTarget)}/cancel`, FACTORY_N_ID, {});
    expect(cancelResN.ok(), '宁国取消自己MRP应成功').toBeTruthy();

    // 验证状态
    const runAfter = await getMrpRun(cancelTarget);
    expect(runAfter.run_status, 'MRP状态应为已取消').toBe('已取消');

    // 清理测试用计划
    await query(`DELETE FROM mrp_run_detail WHERE mrp_run_number = @no`, { no: { type: T.NVarChar, value: cancelTarget } });
    await query(`DELETE FROM mrp_run_plan WHERE mrp_run_number = @no`, { no: { type: T.NVarChar, value: cancelTarget } });
    await query(`DELETE FROM mrp_run WHERE mrp_run_number = @no`, { no: { type: T.NVarChar, value: cancelTarget } });
    await query(`DELETE FROM Production_plan WHERE production_number = @pn`, { pn: { type: T.NVarChar, value: newPlan } });
  });

  // ========== 15. MRP删除 防越权 ==========

  test('15.1 广州删除宁国已取消MRP → 404', async () => {
    // 创建并运行+取消一个MRP
    const delPlanPrefix = 'PP-ML-N3-';
    const delPlan = delPlanPrefix + Date.now();
    await query(`
      INSERT INTO Production_plan (production_number, item_number, item_name, basic_unit, specifications,
        planned_quantity, planned_completion_time, plan_status, approval_status, mrp_status, factory_id)
      VALUES (@pn, @item, N'MRP逻辑-成品', N'个', N'MRP逻辑测试',
        30, DATEADD(day, 30, GETDATE()), N'待加入任务', N'已审批', NULL, @facId)
    `, { pn: { type: T.NVarChar, value: delPlan }, item: { type: T.NVarChar, value: TEST_FG }, facId: { type: T.Int, value: FACTORY_N_ID } });

    const runRes = await facPost('/mrp/run', FACTORY_N_ID, {
      production_numbers: [delPlan],
    });
    expect(runRes.ok()).toBeTruthy();
    const runBody = await runRes.json();
    const deleteTarget = runBody?.data?.mrp_run_number;

    // 先取消
    await facPost(`/mrp/${encodeURIComponent(deleteTarget)}/cancel`, FACTORY_N_ID, {});

    // 广州尝试删除宁国已取消MRP → 404
    const deleteResG = await facDelete(`/mrp/${encodeURIComponent(deleteTarget)}`, FACTORY_G_ID);
    expect(deleteResG.status(), '跨工厂删除MRP应返回404').toBe(404);

    // 宁国可以删除
    const deleteResN = await facDelete(`/mrp/${encodeURIComponent(deleteTarget)}`, FACTORY_N_ID);
    expect(deleteResN.ok(), '宁国删除自己MRP应成功').toBeTruthy();

    // 清理计划
    await query(`DELETE FROM Production_plan WHERE production_number = @pn`, { pn: { type: T.NVarChar, value: delPlan } });
  });

  // ========== 16. 广州MRP执行 ==========

  test('16.1 广州MRP执行 → factory_id=15', async () => {
    const detailRes = await facGet(`/mrp/${encodeURIComponent(S.mrpRunG)}`, FACTORY_G_ID);
    expect(detailRes.ok()).toBeTruthy();
    const detailBody = await detailRes.json();
    const details = detailBody?.data?.details || [];

    const items = details.map((d: any) => ({
      id: d.id,
      produce_quantity: d.produce_quantity || 0,
      purchase_quantity: d.purchase_quantity || 0,
    }));

    const execRes = await facPost('/mrp/execute', FACTORY_G_ID, {
      mrp_run_number: S.mrpRunG,
      items,
    });
    expect(execRes.ok()).toBeTruthy();

    // 广州生产单 factory_id=15
    const prodOrders = await query<any>(
      `SELECT production_order_number, factory_id FROM production_order WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: S.planG } }
    );
    for (const po of prodOrders) {
      expect(po.factory_id, `广州生产单 factory_id应为15`).toBe(FACTORY_G_ID);
    }

    // 广州采购申请 factory_id=15
    const prRows = await query<any>(
      `SELECT purchase_req_number, factory_id FROM purchase_req WHERE source_number = @sn`,
      { sn: { type: T.NVarChar, value: S.mrpRunG } }
    );
    for (const pr of prRows) {
      expect(pr.factory_id, `广州采购申请 factory_id应为15`).toBe(FACTORY_G_ID);
    }
  });

  // ========== 17. 全链路 factory_id 一致性 ==========

  test('17.1 宁国全链路 factory_id=14', async () => {
    // mrp_run
    const run = await getMrpRun(S.mrpRunN);
    expect(run.factory_id).toBe(FACTORY_N_ID);

    // mrp_run_detail
    const details = await getMrpRunDetails(S.mrpRunN);
    for (const d of details) {
      expect(d.factory_id, `detail ${d.item_number} factory_id应为14`).toBe(FACTORY_N_ID);
    }

    // mrp_run_plan
    const plans = await getMrpRunPlans(S.mrpRunN);
    for (const p of plans) {
      expect(p.factory_id).toBe(FACTORY_N_ID);
    }

    // Production_plan
    const ppRows = await query<any>(
      `SELECT factory_id FROM Production_plan WHERE production_number = @no`,
      { no: { type: T.NVarChar, value: S.planN } }
    );
    expect(ppRows[0].factory_id).toBe(FACTORY_N_ID);

    console.log('  全链路 factory_id=14 一致性检查通过');
  });

  test('17.2 广州全链路 factory_id=15', async () => {
    const run = await getMrpRun(S.mrpRunG);
    expect(run.factory_id).toBe(FACTORY_G_ID);

    const details = await getMrpRunDetails(S.mrpRunG);
    for (const d of details) {
      expect(d.factory_id).toBe(FACTORY_G_ID);
    }

    const plans = await getMrpRunPlans(S.mrpRunG);
    for (const p of plans) {
      expect(p.factory_id).toBe(FACTORY_G_ID);
    }
    console.log('  全链路 factory_id=15 一致性检查通过');
  });

  // ========== 18. 清理 ==========

  test('18.1 清理测试数据', async () => {
    await cleanupAll();
    await disposeApiContext();
  });
});

// ==================== 辅助: DELETE with factory header ====================

async function facDelete(path: string, facId: number) {
  const ctx = await getApiContext();
  return ctx.delete(`${API_BASE}${path}`, { headers: { 'x-factory-id': String(facId) } });
}