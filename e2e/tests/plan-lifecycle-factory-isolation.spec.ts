/**
 * 计划管理全链路状态变化 — 多工厂数据隔离 E2E 测试
 * 验证 factory_id 在创建→审批→导入生产单→删除回退→反审→删除 全链路中的传递和隔离
 */
import { test, expect } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import { apiLogin, getApiContext, disposeApiContext, submitAndApprove, reverseApproval } from '../helpers/api.helper';

const API = 'http://localhost:3000/api/v1';
const NID = 14; // 宁国
const GID = 15; // 广州
const ITEM = 'PLN-FI-ITEM';

async function facPost(path: string, facId: number, data?: any) {
  const ctx = await getApiContext();
  const opts: any = { headers: { 'x-factory-id': String(facId) } };
  if (data !== undefined) opts.data = data;
  return ctx.post(`${API}${path}`, opts);
}
async function facGet(path: string, facId: number) {
  const ctx = await getApiContext();
  return ctx.get(`${API}${path}`, { headers: { 'x-factory-id': String(facId) } });
}
async function facPut(path: string, facId: number, data: any) {
  const ctx = await getApiContext();
  return ctx.put(`${API}${path}`, { headers: { 'x-factory-id': String(facId) }, data });
}
async function facDel(path: string, facId: number) {
  const ctx = await getApiContext();
  return ctx.delete(`${API}${path}`, { headers: { 'x-factory-id': String(facId) } });
}

async function getPlan(no: string) {
  const rows = await query<any>(
    `SELECT production_number, item_number, item_name, plan_status, approval_status, mrp_status, factory_id FROM Production_plan WHERE production_number = @no`,
    { no: { type: T.NVarChar, value: no } }
  );
  return rows[0] || null;
}
async function getOrders(pn: string) {
  return await query<any>(
    `SELECT production_order_number, production_number, item_number, factory_id FROM production_order WHERE production_number = @pn`,
    { pn: { type: T.NVarChar, value: pn } }
  );
}

const S: any = {};

test.describe.serial('计划管理全链路状态变化 多工厂数据隔离', () => {

  test('0.1 初始化', async () => {
    await apiLogin('admin', 'admin123');
    await query(`DELETE FROM production_order WHERE item_number = @i`, { i: { type: T.NVarChar, value: ITEM } });
    await query(`DELETE FROM Production_plan WHERE item_number = @i`, { i: { type: T.NVarChar, value: ITEM } });
    await query(`DELETE FROM item_master WHERE item_number = @i`, { i: { type: T.NVarChar, value: ITEM } });
    const ex = await query<any>(`SELECT 1 FROM item_master WHERE item_number = @i`, { i: { type: T.NVarChar, value: ITEM } });
    if (!ex.length) await query(`INSERT INTO item_master (item_number, item_name, item_type, business_scope, basic_unit, specifications, lead_time_days, creation_date) VALUES (@i, N'计划隔离物料', N'成品', N'生产', N'个', N'计划隔离', 3, GETDATE())`, { i: { type: T.NVarChar, value: ITEM } });
  });

  // ========== 1. 创建计划 ==========
  test('1.1 宁国创建 → factory_id=14', async () => {
    const r = await facPost('/plans', NID, { item_number: ITEM, item_name: '宁国', basic_unit: '个', specifications: 'x', planned_quantity: 100, planned_completion_time: '2026-12-31', plan_status: '待加入任务', remark: 'E2E' });
    expect(r.ok()).toBeTruthy();
    S.pn = (await r.json())?.data?.production_number;
    const p = await getPlan(S.pn);
    expect(p.factory_id).toBe(NID);
    expect(p.approval_status).toBe('草稿');
    console.log(`  宁国计划: ${S.pn}, factory_id=${p.factory_id}`);
  });

  test('1.2 广州创建 → factory_id=15', async () => {
    const r = await facPost('/plans', GID, { item_number: ITEM, item_name: '广州', basic_unit: '个', specifications: 'x', planned_quantity: 80, planned_completion_time: '2026-12-31', plan_status: '待加入任务', remark: 'E2E' });
    expect(r.ok()).toBeTruthy();
    S.pg = (await r.json())?.data?.production_number;
    const p = await getPlan(S.pg);
    expect(p.factory_id).toBe(GID);
    console.log(`  广州计划: ${S.pg}, factory_id=${p.factory_id}`);
  });

  // ========== 2. 列表隔离 ==========
  test('2.1 宁国列表不含广州计划', async () => {
    const r = await facGet(`/plans?search=${S.pg}`, NID);
    const items = (await r.json())?.data?.items || [];
    expect(items.find((i: any) => i.production_number === S.pg)).toBeFalsy();
  });

  test('2.2 广州列表不含宁国计划', async () => {
    const r = await facGet(`/plans?search=${S.pn}`, GID);
    const items = (await r.json())?.data?.items || [];
    expect(items.find((i: any) => i.production_number === S.pn)).toBeFalsy();
  });

  test('2.3 宁国列表能看到自己的计划', async () => {
    const r = await facGet(`/plans?search=${S.pn}`, NID);
    const items = (await r.json())?.data?.items || [];
    expect(items.find((i: any) => i.production_number === S.pn)).toBeTruthy();
  });

  // ========== 3. 审批 ==========
  test('3.1 宁国审批 → 已审批, factory_id=14不变', async () => {
    await submitAndApprove('Production_plan', S.pn, NID);
    const p = await getPlan(S.pn);
    expect(p.approval_status).toBe('已审批');
    expect(p.factory_id).toBe(NID);
    console.log('  宁国计划审批后: approval_status=已审批, factory_id=14');
  });

  test('3.2 广州审批 → 已审批, factory_id=15不变', async () => {
    await submitAndApprove('Production_plan', S.pg, GID);
    const p = await getPlan(S.pg);
    expect(p.approval_status).toBe('已审批');
    expect(p.factory_id).toBe(GID);
  });

  // ========== 4. 导入生产单 ==========
  test('4.1 宁国导入生产单 → factory_id=14, plan_status=已加入任务', async () => {
    const r = await facPost('/orders/import-from-plan', NID, { production_numbers: [S.pn] });
    expect(r.ok()).toBeTruthy();
    const orders = await getOrders(S.pn);
    const mine = orders.filter((o: any) => o.factory_id === NID);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    S.on = mine[0].production_order_number;
    const p = await getPlan(S.pn);
    expect(p.plan_status).toBe('已加入任务');
    console.log(`  宁国生产单: ${S.on}, factory_id=${mine[0].factory_id}`);
  });

  test('4.2 广州导入生产单 → factory_id=15', async () => {
    const r = await facPost('/orders/import-from-plan', GID, { production_numbers: [S.pg] });
    expect(r.ok()).toBeTruthy();
    const orders = await getOrders(S.pg);
    const mine = orders.filter((o: any) => o.factory_id === GID);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    S.og = mine[0].production_order_number;
    const p = await getPlan(S.pg);
    expect(p.plan_status).toBe('已加入任务');
  });

  // ========== 5. 删除生产单回退 ==========
  test('5.1 删除宁国生产单 → plan_status回退, factory_id不变', async () => {
    const r = await facDel(`/orders/${S.on}`, NID);
    expect(r.ok()).toBeTruthy();
    const p = await getPlan(S.pn);
    expect(p.plan_status).toBe('待加入任务');
    expect(p.mrp_status).toBeNull();
    expect(p.factory_id).toBe(NID);
    console.log('  删除生产单后: plan_status=待加入任务, mrp_status=null, factory_id=14');
  });

  // ========== 6. 越权防护 ==========
  test('6.1 广州编辑宁国计划 → 无效', async () => {
    await facPut(`/plans/${S.pn}`, GID, { item_name: '越权', item_number: ITEM, basic_unit: '个', specifications: 'x', planned_quantity: 999, planned_completion_time: '2026-12-31', plan_status: '待加入任务', remark: '越权' });
    const p = await getPlan(S.pn);
    expect(p.item_name).not.toBe('越权');
    expect(p.factory_id).toBe(NID);
  });

  test('6.2 广州删除宁国计划 → 无效', async () => {
    await facDel(`/plans/${S.pn}`, GID);
    expect(await getPlan(S.pn)).toBeTruthy();
  });

  test('6.3 广州导入宁国计划 → 403拒绝(越权已修复)', async () => {
    const r = await facPost('/orders/import-from-plan', GID, { production_numbers: [S.pn] });
    // 修复后：跨工厂导入应被拒绝
    expect(r.status()).toBe(403);
    // 计划状态不变
    const p = await getPlan(S.pn);
    expect(p.factory_id).toBe(NID);
    expect(p.plan_status).toBe('待加入任务');
    // 不应产生跨工厂的生产单
    const orders = await getOrders(S.pn);
    const crossOrders = orders.filter((o: any) => o.factory_id === GID);
    expect(crossOrders.length).toBe(0);
  });

  test('6.4 广州审批宁国计划 → 无效(审批隔离已修复)', async () => {
    // 宁国计划当前是已审批状态，先反审回草稿
    await reverseApproval('Production_plan', S.pn);
    let p = await getPlan(S.pn);
    expect(p.approval_status).toBe('草稿');

    // 广州提交审批宁国计划 → 应该被拒绝
    const submitRes = await facPost('/approval/submit', GID, { module: 'Production_plan', record_id: S.pn, remark: '越权提交' });
    // 提交应失败（factory_id不匹配）
    expect(submitRes.ok()).toBeFalsy();

    // 宁国计划应仍为草稿
    p = await getPlan(S.pn);
    expect(p.approval_status).toBe('草稿');
    expect(p.factory_id).toBe(NID);

    // 重新审批以恢复状态
    await submitAndApprove('Production_plan', S.pn, NID);
  });

  // ========== 7. 反审 ==========
  test('7.1 宁国反审 → 草稿, factory_id不变', async () => {
    await reverseApproval('Production_plan', S.pn, NID);
    const p = await getPlan(S.pn);
    expect(p.approval_status).toBe('草稿');
    expect(p.factory_id).toBe(NID);
    console.log('  反审后: approval_status=草稿, factory_id=14');
  });

  // ========== 8. 删除计划 ==========
  test('8.1 宁国删除草稿计划 → 成功', async () => {
    expect((await getPlan(S.pn)).approval_status).toBe('草稿');
    const r = await facDel(`/plans/${S.pn}`, NID);
    expect(r.ok()).toBeTruthy();
    expect(await getPlan(S.pn)).toBeNull();
  });

  test('8.2 广州删除已审批计划 → 403', async () => {
    expect((await getPlan(S.pg)).approval_status).toBe('已审批');
    const r = await facDel(`/plans/${S.pg}`, GID);
    expect(r.status()).toBe(403);
    expect(await getPlan(S.pg)).toBeTruthy();
  });

  // ========== 9. 完整链路 ==========
  test('9.1 宁国全链路: 创建→审批→导入→删除生产单→反审→删除', async () => {
    const cr = await facPost('/plans', NID, { item_number: ITEM, item_name: '全链路-宁国', basic_unit: '个', specifications: 'x', planned_quantity: 50, planned_completion_time: '2026-12-31', plan_status: '待加入任务', remark: 'E2E' });
    expect(cr.ok()).toBeTruthy();
    const pn = (await cr.json())?.data?.production_number;

    let p = await getPlan(pn);
    expect(p.factory_id).toBe(NID);
    expect(p.approval_status).toBe('草稿');

    await submitAndApprove('Production_plan', pn, NID);
    p = await getPlan(pn);
    expect(p.approval_status).toBe('已审批');
    expect(p.factory_id).toBe(NID);

    const ir = await facPost('/orders/import-from-plan', NID, { production_numbers: [pn] });
    expect(ir.ok()).toBeTruthy();
    const orders = await getOrders(pn);
    const mine = orders.filter((o: any) => o.factory_id === NID);
    expect(mine.length, '应有factory_id=14的生产单').toBeGreaterThanOrEqual(1);
    p = await getPlan(pn);
    expect(p.plan_status).toBe('已加入任务');

    await facDel(`/orders/${mine[0].production_order_number}`, NID);
    p = await getPlan(pn);
    expect(p.plan_status).toBe('待加入任务');
    expect(p.factory_id).toBe(NID);

    await reverseApproval('Production_plan', pn, NID);
    p = await getPlan(pn);
    expect(p.approval_status).toBe('草稿');
    expect(p.factory_id).toBe(NID);

    await facDel(`/plans/${pn}`, NID);
    expect(await getPlan(pn)).toBeNull();
    console.log('  宁国全链路状态变化测试通过');
  });

  test('9.2 广州全链路: 创建→审批→导入→删除生产单→反审→删除', async () => {
    const cr = await facPost('/plans', GID, { item_number: ITEM, item_name: '全链路-广州', basic_unit: '个', specifications: 'x', planned_quantity: 60, planned_completion_time: '2026-12-31', plan_status: '待加入任务', remark: 'E2E' });
    expect(cr.ok()).toBeTruthy();
    const pn = (await cr.json())?.data?.production_number;

    await submitAndApprove('Production_plan', pn, GID);
    let p = await getPlan(pn);
    expect(p.factory_id).toBe(GID);

    await facPost('/orders/import-from-plan', GID, { production_numbers: [pn] });
    const orders = await getOrders(pn);
    const mine = orders.filter((o: any) => o.factory_id === GID);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    p = await getPlan(pn);
    expect(p.plan_status).toBe('已加入任务');

    await facDel(`/orders/${mine[0].production_order_number}`, GID);
    p = await getPlan(pn);
    expect(p.plan_status).toBe('待加入任务');
    expect(p.factory_id).toBe(GID);

    await reverseApproval('Production_plan', pn, GID);
    p = await getPlan(pn);
    expect(p.approval_status).toBe('草稿');

    await facDel(`/plans/${pn}`, GID);
    expect(await getPlan(pn)).toBeNull();
    console.log('  广州全链路状态变化测试通过');
  });

  // ========== 10. 清理 ==========
  test('10.1 清理残留', async () => {
    const orders = await getOrders(S.pg);
    for (const o of orders) await query(`DELETE FROM production_order WHERE production_order_number = @no`, { no: { type: T.NVarChar, value: o.production_order_number } });
    await query(`UPDATE Production_plan SET approval_status = N'草稿' WHERE production_number = @pn`, { pn: { type: T.NVarChar, value: S.pg } });
    await query(`DELETE FROM Production_plan WHERE production_number = @pn`, { pn: { type: T.NVarChar, value: S.pg } });
  });

  test('10.2 最终清理', async () => {
    await query(`DELETE FROM production_order WHERE item_number = @i`, { i: { type: T.NVarChar, value: ITEM } });
    await query(`DELETE FROM Production_plan WHERE item_number = @i`, { i: { type: T.NVarChar, value: ITEM } });
    await query(`DELETE FROM item_master WHERE item_number = @i`, { i: { type: T.NVarChar, value: ITEM } });
    await disposeApiContext();
  });
});
