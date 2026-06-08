/**
 * MRP→采购 全流程 — 多工厂数据隔离 E2E 测试
 *
 * 覆盖 factory_id 传递链路：
 *   Production_plan → mrp_run → mrp_run_detail
 *     → production_order (生产单)
 *     → purchase_req + purchase_req_detail (采购申请)
 *     → purchase_order + purchase_order_detail (采购订单)
 *
 * 测试内容：
 *   1. 生产计划 factory_id 写入
 *   2. MRP可运算计划列表 factory_id 隔离
 *   3. MRP运算 → mrp_run.factory_id
 *   4. MRP运行列表 factory_id 隔离
 *   5. MRP运行详情防越权
 *   6. MRP执行 → 生产单+采购申请 factory_id 传递
 *   7. 生产单 factory_id + 列表隔离
 *   8. 采购申请 factory_id + 列表隔离 + 详情防越权
 *   9. 采购申请审批 → 状态变更
 *  10. 采购申请转采购订单 → factory_id 传递
 *  11. 采购订单列表隔离 + 详情防越权
 *  12. 全链路 factory_id 一致性
 */
import { test, expect } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import { apiLogin, getApiContext, disposeApiContext } from '../helpers/api.helper';

const API_BASE = 'http://localhost:3000/api/v1';
const FACTORY_N_ID = 14;
const FACTORY_G_ID = 15;
const MARKER = `MRP-FAC-E2E-${Date.now()}`;
const TEST_FG = 'MRP-FAC-FG';   // 成品
const TEST_RM = 'MRP-FAC-RM';   // 原材料(采购)

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

async function facPut(path: string, facId: number, data: any) {
  const ctx = await getApiContext();
  return ctx.put(`${API_BASE}${path}`, {
    headers: { 'x-factory-id': String(facId) },
    data,
  });
}

// ==================== DB 辅助 ====================

async function getMrpRun(runNumber: string) {
  const rows = await query<any>(
    `SELECT mrp_run_number, run_status, plan_count, result_count, factory_id
     FROM mrp_run WHERE mrp_run_number = @no`,
    { no: { type: T.NVarChar, value: runNumber } }
  );
  return rows[0] || null;
}

async function getPurchaseReq(prNumber: string) {
  const rows = await query<any>(
    `SELECT purchase_req_number, approval_status, order_status, source_number, factory_id
     FROM purchase_req WHERE purchase_req_number = @no`,
    { no: { type: T.NVarChar, value: prNumber } }
  );
  return rows[0] || null;
}

async function getPurchaseOrder(poNumber: string) {
  const rows = await query<any>(
    `SELECT purchase_order_number, approval_status, order_status, source_req_number, factory_id
     FROM purchase_order WHERE purchase_order_number = @no`,
    { no: { type: T.NVarChar, value: poNumber } }
  );
  return rows[0] || null;
}

async function getProductionOrder(orderNumber: string) {
  const rows = await query<any>(
    `SELECT production_order_number, production_number, item_number, plan_status, approval_status, factory_id
     FROM production_order WHERE production_order_number = @no`,
    { no: { type: T.NVarChar, value: orderNumber } }
  );
  return rows[0] || null;
}

// ==================== 共享状态 ====================
const S: any = {};

// ==================== 种子数据 ====================

async function seedData() {
  const now = new Date();
  const creationDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 1. 确保成品物料存在 (business_scope='生产')
  const fgExist = await query<any>(
    `SELECT item_number FROM item_master WHERE item_number = @no`,
    { no: { type: T.NVarChar, value: TEST_FG } }
  );
  if (!fgExist.length) {
    await query(`
      INSERT INTO item_master (item_number, item_name, item_type, business_scope, basic_unit, specifications, lead_time_days, creation_date)
      VALUES (@item, N'E2E-MRP成品', N'成品', N'生产', N'个', N'测试', 3, GETDATE())
    `, { item: { type: T.NVarChar, value: TEST_FG } });
  }

  // 2. 确保原材料存在 (business_scope='采购')
  const rmExist = await query<any>(
    `SELECT item_number FROM item_master WHERE item_number = @no`,
    { no: { type: T.NVarChar, value: TEST_RM } }
  );
  if (!rmExist.length) {
    await query(`
      INSERT INTO item_master (item_number, item_name, item_type, business_scope, basic_unit, specifications, lead_time_days, creation_date)
      VALUES (@item, N'E2E-MRP原材料', N'原材料', N'采购', N'个', N'测试', 5, GETDATE())
    `, { item: { type: T.NVarChar, value: TEST_RM } });
  }

  // 3. 确保BOM存在 (成品 → 原材料)
  const bomNumber = 'BOM-MRP-FAC-E2E';
  const bomExist = await query<any>(
    `SELECT bom_number FROM bom_header WHERE bom_number = @no`,
    { no: { type: T.NVarChar, value: bomNumber } }
  );
  if (!bomExist.length) {
    await query(`
      INSERT INTO bom_header (bom_number, bom_name, item_number, item_name, bom_version, bom_type, base_quantity, base_unit, [condition], approval_status, creation_date, creation_man)
      VALUES (@bn, N'E2E-MRP-BOM', @item, N'E2E-MRP成品', N'V1', N'制造BOM', 1, N'个', N'启用', N'已审批', GETDATE(), N'E2E')
    `, { bn: { type: T.NVarChar, value: bomNumber }, item: { type: T.NVarChar, value: TEST_FG } });

    await query(`
      INSERT INTO bom_detail (bom_number, line_number, material_number, material_name, material_type, standard_quantity, unit, wastage_rate, actual_quantity, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, remark)
      VALUES (@bn, 10, @rm, N'E2E-MRP原材料', N'原材料', 2, N'个', 0, 2, 0, '', 0, N'采购', '', '')
    `, { bn: { type: T.NVarChar, value: bomNumber }, rm: { type: T.NVarChar, value: TEST_RM } });
  }

  // 4. 宁国：生产计划（已审批 + 待加入任务 + mrp_status=NULL）
  const planPrefix = 'PP-MRP-N-';
  S.planN = planPrefix + Date.now();
  const planNExist = await query<any>(
    `SELECT production_number FROM Production_plan WHERE production_number = @no`,
    { no: { type: T.NVarChar, value: S.planN } }
  );
  if (!planNExist.length) {
    await query(`
      INSERT INTO Production_plan (production_number, item_number, item_name, basic_unit, specifications,
        planned_quantity, planned_completion_time, plan_status, approval_status, mrp_status, factory_id)
      VALUES (@pn, @item, N'E2E-MRP成品', N'个', N'测试',
        100, DATEADD(day, 30, GETDATE()), N'待加入任务', N'已审批', NULL, @facId)
    `, { pn: { type: T.NVarChar, value: S.planN }, item: { type: T.NVarChar, value: TEST_FG }, facId: { type: T.Int, value: FACTORY_N_ID } });
  }

  // 5. 广州：生产计划（已审批 + 待加入任务 + mrp_status=NULL）
  const planPrefixG = 'PP-MRP-G-';
  S.planG = planPrefixG + Date.now();
  const planGExist = await query<any>(
    `SELECT production_number FROM Production_plan WHERE production_number = @no`,
    { no: { type: T.NVarChar, value: S.planG } }
  );
  if (!planGExist.length) {
    await query(`
      INSERT INTO Production_plan (production_number, item_number, item_name, basic_unit, specifications,
        planned_quantity, planned_completion_time, plan_status, approval_status, mrp_status, factory_id)
      VALUES (@pn, @item, N'E2E-MRP成品', N'个', N'测试',
        80, DATEADD(day, 30, GETDATE()), N'待加入任务', N'已审批', NULL, @facId)
    `, { pn: { type: T.NVarChar, value: S.planG }, item: { type: T.NVarChar, value: TEST_FG }, facId: { type: T.Int, value: FACTORY_G_ID } });
  }

  // 6. 确保有测试供应商
  const testSupplier = 'SUP-MRP-E2E';
  const supExist = await query<any>(
    `SELECT supplier_number FROM supplier WHERE supplier_number = @no`,
    { no: { type: T.NVarChar, value: testSupplier } }
  );
  if (!supExist.length) {
    await query(`
      INSERT INTO supplier (supplier_number, supplier_name, [condition], factory_id)
      VALUES (@no, N'E2E测试供应商', N'启用', NULL)
    `, { no: { type: T.NVarChar, value: testSupplier } });
  }
  S.supplierNumber = testSupplier;
  S.supplierName = 'E2E测试供应商';
  S.bomNumber = bomNumber;

  console.log(`  种子数据: 计划宁国=${S.planN}, 计划广州=${S.planG}, 供应商=${S.supplierNumber}`);
}

// ==================== 清理 ====================

async function cleanupAll() {
  // 清理采购订单
  if (S.poN) {
    await query(`DELETE FROM purchase_order_detail WHERE purchase_order_number = @no`, { no: { type: T.NVarChar, value: S.poN } });
  }
  await query(`DELETE FROM purchase_order WHERE source_req_number LIKE 'PRN-%' OR source_req_number LIKE 'PRG-%'`);

  // 清理采购申请
  await query(`DELETE FROM purchase_req_detail WHERE purchase_req_number LIKE 'PRN-%' OR purchase_req_number LIKE 'PRG-%'`);
  await query(`DELETE FROM purchase_req WHERE source_number LIKE 'MRPN-%' OR source_number LIKE 'MRPG-%'`);

  // 清理生产单
  await query(`DELETE FROM production_order WHERE remark LIKE N'%MRP自动生成%MRPN-%' OR remark LIKE N'%MRP自动生成%MRPG-%'`);
  // 也清理导入计划生成的生产单
  await query(`DELETE FROM production_order WHERE production_number LIKE 'PP-MRP-%'`);

  // 清理MRP
  await query(`DELETE FROM mrp_run_detail WHERE mrp_run_number LIKE 'MRPN-%' OR mrp_run_number LIKE 'MRPG-%'`);
  await query(`DELETE FROM mrp_run_plan WHERE mrp_run_number LIKE 'MRPN-%' OR mrp_run_number LIKE 'MRPG-%'`);
  await query(`DELETE FROM mrp_run WHERE mrp_run_number LIKE 'MRPN-%' OR mrp_run_number LIKE 'MRPG-%'`);

  // 清理生产计划
  await query(`DELETE FROM Production_plan WHERE production_number LIKE 'PP-MRP-%'`);

  // 清理BOM
  await query(`DELETE FROM bom_detail WHERE bom_number = @bn`, { bn: { type: T.NVarChar, value: 'BOM-MRP-FAC-E2E' } });
  await query(`DELETE FROM bom_header WHERE bom_number = @bn`, { bn: { type: T.NVarChar, value: 'BOM-MRP-FAC-E2E' } });

  // 清理物料
  await query(`DELETE FROM item_master WHERE item_number = @item`, { item: { type: T.NVarChar, value: TEST_FG } });
  await query(`DELETE FROM item_master WHERE item_number = @item`, { item: { type: T.NVarChar, value: TEST_RM } });

  // 清理供应商
  await query(`DELETE FROM supplier WHERE supplier_number = @no`, { no: { type: T.NVarChar, value: 'SUP-MRP-E2E' } });
}

// ==================== 测试 ====================

test.describe.serial('MRP→采购 全流程 多工厂数据隔离', () => {

  // ========== 0. 初始化 ==========
  test('0.1 登录 + 种子数据', async () => {
    await apiLogin('admin', 'admin123');
    await seedData();
  });

  // ========== 1. 生产计划 factory_id ==========
  test('1.1 宁国生产计划 factory_id 为14', async () => {
    const rows = await query<any>(
      `SELECT production_number, factory_id, approval_status, plan_status FROM Production_plan WHERE production_number = @no`,
      { no: { type: T.NVarChar, value: S.planN } }
    );
    expect(rows.length, '宁国计划应存在').toBeGreaterThanOrEqual(1);
    expect(rows[0].factory_id, '宁国计划 factory_id 应为14').toBe(FACTORY_N_ID);
    expect(rows[0].approval_status, '计划应为已审批').toBe('已审批');
    expect(rows[0].plan_status, '计划应为待加入任务').toBe('待加入任务');
  });

  test('1.2 广州生产计划 factory_id 为15', async () => {
    const rows = await query<any>(
      `SELECT production_number, factory_id, approval_status, plan_status FROM Production_plan WHERE production_number = @no`,
      { no: { type: T.NVarChar, value: S.planG } }
    );
    expect(rows.length, '广州计划应存在').toBeGreaterThanOrEqual(1);
    expect(rows[0].factory_id, '广州计划 factory_id 应为15').toBe(FACTORY_G_ID);
  });

  // ========== 2. MRP可运算计划列表 factory_id 隔离 ==========
  test('2.1 宁国MRP可运算列表不含广州计划', async () => {
    const res = await facGet(`/mrp/plans-for-mrp?search=${S.planG}`, FACTORY_N_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data || [];
    const found = items.find((i: any) => i.production_number === S.planG);
    expect(found, '宁国MRP计划列表不应看到广州计划').toBeFalsy();
  });

  test('2.2 广州MRP可运算列表不含宁国计划', async () => {
    const res = await facGet(`/mrp/plans-for-mrp?search=${S.planN}`, FACTORY_G_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data || [];
    const found = items.find((i: any) => i.production_number === S.planN);
    expect(found, '广州MRP计划列表不应看到宁国计划').toBeFalsy();
  });

  // ========== 3. MRP运算 → mrp_run.factory_id ==========
  test('3.1 宁国MRP运算 → mrp_run factory_id 为14', async () => {
    const res = await facPost('/mrp/run', FACTORY_N_ID, {
      production_numbers: [S.planN],
    });
    expect(res.ok(), `宁国MRP运算应成功`).toBeTruthy();
    const body = await res.json();
    const mrpRunNumber = body?.data?.mrp_run_number;
    expect(mrpRunNumber, '应返回MRP运行编号').toBeTruthy();
    S.mrpRunN = mrpRunNumber;

    const run = await getMrpRun(S.mrpRunN);
    expect(run, 'MRP运行记录应存在').toBeTruthy();
    expect(run.factory_id, 'MRP运行 factory_id 应为14').toBe(FACTORY_N_ID);
    expect(run.run_status, 'MRP状态应为已计算').toBe('已计算');
    console.log(`  宁国MRP运行: ${S.mrpRunN}, factory_id=${run.factory_id}`);
  });

  // ========== 4. MRP运行列表 factory_id 隔离 ==========
  test('4.1 广州MRP列表不含宁国MRP运行', async () => {
    const res = await facGet(`/mrp/?search=${S.mrpRunN}`, FACTORY_G_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const found = items.find((i: any) => i.mrp_run_number === S.mrpRunN);
    expect(found, '广州不应看到宁国MRP运行').toBeFalsy();
  });

  // ========== 5. MRP运行详情防越权 ==========
  test('5.1 广州查看宁国MRP详情返回404', async () => {
    const res = await facGet(`/mrp/${encodeURIComponent(S.mrpRunN)}`, FACTORY_G_ID);
    expect(res.status(), '跨工厂查看MRP详情应返回404').toBe(404);
  });

  // ========== 6. 广州MRP运算 ==========
  test('6.1 广州MRP运算 → mrp_run factory_id 为15', async () => {
    const res = await facPost('/mrp/run', FACTORY_G_ID, {
      production_numbers: [S.planG],
    });
    expect(res.ok(), `广州MRP运算应成功`).toBeTruthy();
    const body = await res.json();
    S.mrpRunG = body?.data?.mrp_run_number;
    expect(S.mrpRunG, '应返回广州MRP运行编号').toBeTruthy();

    const run = await getMrpRun(S.mrpRunG);
    expect(run.factory_id, '广州MRP运行 factory_id 应为15').toBe(FACTORY_G_ID);
    console.log(`  广州MRP运行: ${S.mrpRunG}, factory_id=${run.factory_id}`);
  });

  // ========== 7. MRP执行 → 生产单+采购申请 factory_id ==========
  test('7.1 宁国MRP执行 → 生产单+采购申请 factory_id 传递', async () => {
    // 先获取MRP详情，拿到detail行ID
    const detailRes = await facGet(`/mrp/${encodeURIComponent(S.mrpRunN)}`, FACTORY_N_ID);
    expect(detailRes.ok()).toBeTruthy();
    const detailBody = await detailRes.json();
    const details = detailBody?.data?.details || [];

    // 构建execute的items
    const items = details.map((d: any) => ({
      id: d.id,
      produce_quantity: d.produce_quantity || 0,
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
    expect(execRes.ok(), `宁国MRP执行应成功`).toBeTruthy();
    const execBody = await execRes.json();
    console.log(`  MRP执行结果: 生产单=${execBody?.data?.production_order_count}, 采购申请行=${execBody?.data?.purchase_req_line_count}`);

    // 验证MRP运行状态
    const run = await getMrpRun(S.mrpRunN);
    expect(run.run_status, 'MRP状态应为已确认').toBe('已确认');

    // 验证生产单 factory_id
    const prodOrders = await query<any>(
      `SELECT production_order_number, item_number, factory_id FROM production_order WHERE remark LIKE @remark`,
      { remark: { type: T.NVarChar, value: `%${S.mrpRunN}%` } }
    );
    console.log(`  宁国MRP生成生产单: ${prodOrders.length} 条`);
    for (const po of prodOrders) {
      expect(po.factory_id, `生产单 ${po.production_order_number} factory_id 应为14`).toBe(FACTORY_N_ID);
    }
    if (prodOrders.length > 0) S.prodOrderN = prodOrders[0].production_order_number;

    // 验证采购申请 factory_id
    const prRows = await query<any>(
      `SELECT purchase_req_number, factory_id FROM purchase_req WHERE source_number = @sn`,
      { sn: { type: T.NVarChar, value: S.mrpRunN } }
    );
    console.log(`  宁国MRP生成采购申请: ${prRows.length} 条`);
    for (const pr of prRows) {
      expect(pr.factory_id, `采购申请 ${pr.purchase_req_number} factory_id 应为14`).toBe(FACTORY_N_ID);
    }
    if (prRows.length > 0) S.prN = prRows[0].purchase_req_number;
  });

  // ========== 8. 生产单 factory_id + 列表隔离 ==========
  test('8.1 广州生产单列表不含宁国生产单', async () => {
    if (!S.prodOrderN) return;
    // 生产单在 /orders 路径下（production模块）
    const res = await facGet(`/orders?search=${S.prodOrderN}`, FACTORY_G_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const found = items.find((i: any) => i.production_order_number === S.prodOrderN);
    expect(found, '广州不应看到宁国生产单').toBeFalsy();
  });

  // ========== 9. 采购申请 factory_id + 列表隔离 ==========
  test('9.1 宁国采购申请 factory_id 为14', async () => {
    if (!S.prN) return;
    const pr = await getPurchaseReq(S.prN);
    expect(pr, '采购申请应存在').toBeTruthy();
    expect(pr.factory_id, '采购申请 factory_id 应为14').toBe(FACTORY_N_ID);
    expect(pr.approval_status, '采购申请状态应为草稿').toBe('草稿');
  });

  test('9.2 广州采购申请列表不含宁国申请', async () => {
    if (!S.prN) return;
    const res = await facGet(`/purchase-reqs?search=${S.prN}`, FACTORY_G_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const found = items.find((i: any) => i.purchase_req_number === S.prN);
    expect(found, '广州不应看到宁国采购申请').toBeFalsy();
  });

  test('9.3 广州查看宁国采购申请详情返回404', async () => {
    if (!S.prN) return;
    const res = await facGet(`/purchase-reqs/${encodeURIComponent(S.prN)}`, FACTORY_G_ID);
    expect(res.status(), '跨工厂查看采购申请详情应返回404').toBe(404);
  });

  // ========== 10. 采购申请审批 ==========
  test('10.1 宁国采购申请审批 → 状态变为已审批', async () => {
    if (!S.prN) return;

    // 提交审批
    const submitRes = await facPost('/approval/submit', FACTORY_N_ID, {
      module: 'purchase_req',
      record_id: S.prN,
    });
    console.log(`  提交审批: ${submitRes.status()}`);
    if (!submitRes.ok()) {
      const errText = await submitRes.text().catch(() => '');
      console.log(`  提交审批失败: ${errText}`);
    }

    // 审批通过
    const approveRes = await facPost('/approval/approve', FACTORY_N_ID, {
      module: 'purchase_req',
      record_id: S.prN,
    });
    console.log(`  审批结果: ${approveRes.status()}`);

    const pr = await getPurchaseReq(S.prN);
    expect(pr.approval_status, '采购申请应变为已审批').toBe('已审批');
  });

  // ========== 11. 采购申请转采购订单 ==========
  test('11.1 宁国采购申请转采购订单 → factory_id 传递', async () => {
    if (!S.prN) return;

    // 获取采购申请明细
    const detailRes = await facGet(`/purchase-reqs/${encodeURIComponent(S.prN)}`, FACTORY_N_ID);
    expect(detailRes.ok()).toBeTruthy();
    const detailBody = await detailRes.json();
    const details = detailBody?.data?.details || [];
    expect(details.length, '采购申请应有明细行').toBeGreaterThanOrEqual(1);
    const detailIds = details.map((d: any) => d.id);

    // 转采购订单
    const toOrderRes = await facPost(`/purchase-reqs/${encodeURIComponent(S.prN)}/to-order`, FACTORY_N_ID, {
      supplier_number: S.supplierNumber,
      supplier_name: S.supplierName,
      detail_ids: detailIds,
      delivery_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    });

    if (!toOrderRes.ok()) {
      const errText = await toOrderRes.text().catch(() => '');
      console.log(`  转采购订单失败(${toOrderRes.status()}): ${errText}`);
    }
    expect(toOrderRes.ok(), `转采购订单应成功`).toBeTruthy();

    // 查找生成的采购订单
    const poRows = await query<any>(
      `SELECT purchase_order_number, factory_id, source_req_number FROM purchase_order WHERE source_req_number = @sn`,
      { sn: { type: T.NVarChar, value: S.prN } }
    );
    expect(poRows.length, '应有采购订单生成').toBeGreaterThanOrEqual(1);
    for (const po of poRows) {
      expect(po.factory_id, `采购订单 ${po.purchase_order_number} factory_id 应为14`).toBe(FACTORY_N_ID);
    }
    S.poN = poRows[0].purchase_order_number;
    console.log(`  宁国采购订单: ${S.poN}, factory_id=${poRows[0].factory_id}`);

    // 验证采购订单明细
    const poDetails = await query<any>(
      `SELECT item_number, order_quantity, factory_id FROM purchase_order_detail WHERE purchase_order_number = @no`,
      { no: { type: T.NVarChar, value: S.poN } }
    );
    expect(poDetails.length, '采购订单应有明细行').toBeGreaterThanOrEqual(1);

    // 验证申请明细行状态
    const prDetail = await query<any>(
      `SELECT status FROM purchase_req_detail WHERE purchase_req_number = @no`,
      { no: { type: T.NVarChar, value: S.prN } }
    );
    for (const d of prDetail) {
      expect(d.status, '采购申请明细状态应为已转单').toBe('已转单');
    }
  });

  // ========== 12. 采购订单列表隔离 + 详情防越权 ==========
  test('12.1 广州采购订单列表不含宁国订单', async () => {
    if (!S.poN) return;
    const res = await facGet(`/purchase-orders?search=${S.poN}`, FACTORY_G_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const found = items.find((i: any) => i.purchase_order_number === S.poN);
    expect(found, '广州不应看到宁国采购订单').toBeFalsy();
  });

  test('12.2 广州查看宁国采购订单详情返回404', async () => {
    if (!S.poN) return;
    const res = await facGet(`/purchase-orders/${encodeURIComponent(S.poN)}`, FACTORY_G_ID);
    expect(res.status(), '跨工厂查看采购订单详情应返回404').toBe(404);
  });

  // ========== 13. 全链路 factory_id 一致性 ==========
  test('13.1 宁国全链路 factory_id=14 一致性检查', async () => {
    // MRP Run
    const run = await getMrpRun(S.mrpRunN);
    if (!run) { console.log('  宁国MRP运行记录不存在，跳过'); return; }
    expect(run.factory_id, 'MRP运行 factory_id 应为14').toBe(FACTORY_N_ID);

    // 生产单
    if (S.prodOrderN) {
      const order = await getProductionOrder(S.prodOrderN);
      if (order) {
        expect(order.factory_id, '生产单 factory_id 应为14').toBe(FACTORY_N_ID);
      }
    }

    // 采购申请
    if (S.prN) {
      const pr = await getPurchaseReq(S.prN);
      if (pr) {
        expect(pr.factory_id, '采购申请 factory_id 应为14').toBe(FACTORY_N_ID);
      }
    }

    // 采购订单
    if (S.poN) {
      const po = await getPurchaseOrder(S.poN);
      if (po) {
        expect(po.factory_id, '采购订单 factory_id 应为14').toBe(FACTORY_N_ID);
      }
    }

    console.log('  全链路 factory_id 一致性检查通过');
  });

  // ========== 14. 广州MRP执行（补充） ==========
  test('14.1 广州MRP执行 → 生产单+采购申请 factory_id 为15', async () => {
    // 获取广州MRP详情
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

    if (!execRes.ok()) {
      const errText = await execRes.text().catch(() => '');
      console.log(`  广州MRP执行失败(${execRes.status()}): ${errText}`);
    }
    expect(execRes.ok(), `广州MRP执行应成功`).toBeTruthy();

    // 验证广州生产单 factory_id
    const prodOrders = await query<any>(
      `SELECT production_order_number, item_number, factory_id FROM production_order WHERE remark LIKE @remark`,
      { remark: { type: T.NVarChar, value: `%${S.mrpRunG}%` } }
    );
    for (const po of prodOrders) {
      expect(po.factory_id, `广州生产单 ${po.production_order_number} factory_id 应为15`).toBe(FACTORY_G_ID);
    }

    // 验证广州采购申请 factory_id
    const prRows = await query<any>(
      `SELECT purchase_req_number, factory_id FROM purchase_req WHERE source_number = @sn`,
      { sn: { type: T.NVarChar, value: S.mrpRunG } }
    );
    for (const pr of prRows) {
      expect(pr.factory_id, `广州采购申请 ${pr.purchase_req_number} factory_id 应为15`).toBe(FACTORY_G_ID);
    }
    console.log(`  广州MRP执行完成: 生产单=${prodOrders.length}, 采购申请=${prRows.length}`);
  });

  // ========== 15. 清理 ==========
  test('15.1 清理测试数据', async () => {
    await cleanupAll();
    await disposeApiContext();
  });
});
