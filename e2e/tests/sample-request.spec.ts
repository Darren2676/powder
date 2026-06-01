/**
 * 样品申请管理 E2E 测试
 *
 * 测试策略：API 驱动 + DB 断言（纯API，无UI操作）
 *
 * 测试场景：
 *   1. 创建样品申请（含默认明细项）
 *   2. DB断言 - 主表字段 + 默认明细行
 *   3. 查询详情 API
 *   4. 查询列表 API（筛选）
 *   5. 更新草稿（主表+明细替换）
 *   6. 状态流转：草稿 → 提交（待研发）
 *   7. 撤回（待研发 → 草稿）
 *   8. 再次提交 → 接收（待研发 → 研发中）+ 实验室记录
 *   9. 保存实验室数据
 *  10. 完成研发（研发中 → 已完成）
 *  11. 非法状态转换校验
 *  12. 已提交不可编辑/删除
 *  13. 删除草稿
 *  14. 编号生成规则 SR-YYYYMMDD-NNN
 */
import { test, expect } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import { getApiContext, disposeApiContext } from '../helpers/api.helper';

const API_BASE = 'http://localhost:3000/api/v1';
const TEST_MARKER = `E2E-SR-${Date.now()}`;

// ==================== DB 辅助函数 ====================

/** 查找可用客户 */
async function findCustomer() {
  const rows = await query<any>(
    `SELECT TOP 1 customer_number, customer_name FROM customer`
  );
  return rows[0] || null;
}

/** 查询样品申请主表 */
async function getSampleRequest(requestNumber: string) {
  const rows = await query<any>(
    `SELECT request_number, request_date, deadline_date, applicant, urgency,
            customer_name, market, competitor, estimated_price, potential_usage, has_order,
            coating_workpiece, substrate, pretreatment, spray_gun_type, recovery_system, oven_type,
            color_spec, product_type, film_thickness, gloss_range, curing_condition, other_requirements,
            status, approval_status, created_by, created_at, updated_at
     FROM sample_request WHERE request_number = @rn`,
    { rn: { type: T.NVarChar, value: requestNumber } }
  );
  return rows[0] || null;
}

/** 查询样品申请明细 */
async function getSampleRequestItems(requestNumber: string) {
  return await query<any>(
    `SELECT id, request_number, item_type, quantity, unit, is_requested, sort_order
     FROM sample_request_item WHERE request_number = @rn ORDER BY sort_order`,
    { rn: { type: T.NVarChar, value: requestNumber } }
  );
}

/** 查询实验室数据 */
async function getSampleRequestLab(requestNumber: string) {
  const rows = await query<any>(
    `SELECT id, request_number, received_by, received_at,
            lab_panel_qty, lab_powder_qty, completion_date, product_number, formula_cost,
            lab_remark, completed_by, completed_at
     FROM sample_request_lab WHERE request_number = @rn`,
    { rn: { type: T.NVarChar, value: requestNumber } }
  );
  return rows[0] || null;
}

/** 清理测试数据 */
async function cleanupTestData() {
  const headers = await query<any>(
    `SELECT request_number FROM sample_request WHERE other_requirements = @mk`,
    { mk: { type: T.NVarChar, value: TEST_MARKER } }
  );
  for (const h of headers) {
    await query(`DELETE FROM sample_request_lab WHERE request_number = @rn`, { rn: { type: T.NVarChar, value: h.request_number } });
    await query(`DELETE FROM sample_request_item WHERE request_number = @rn`, { rn: { type: T.NVarChar, value: h.request_number } });
  }
  await query(`DELETE FROM sample_request WHERE other_requirements = @mk`, { mk: { type: T.NVarChar, value: TEST_MARKER } });
  console.log(`[Cleanup] 清理样品申请测试数据 ${headers.length} 条`);
}

// ==================== API 辅助函数 ====================

async function createSampleRequestAPI(data: any) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-requests`, { data });
  if (!res.ok()) throw new Error(`创建样品申请失败 ${res.status()}: ${await res.text()}`);
  return (await res.json())?.data;
}

async function getSampleRequestDetailAPI(id: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/sample-requests/${encodeURIComponent(id)}`);
  if (!res.ok()) throw new Error(`获取详情失败 ${res.status()}: ${await res.text()}`);
  return (await res.json())?.data;
}

async function getSampleRequestListAPI(params?: Record<string, string>) {
  const ctx = await getApiContext();
  const qs = new URLSearchParams(params || {}).toString();
  const url = `${API_BASE}/sample-requests${qs ? '?' + qs : ''}`;
  const res = await ctx.get(url);
  if (!res.ok()) throw new Error(`查询列表失败 ${res.status()}: ${await res.text()}`);
  return (await res.json())?.data;
}

async function updateSampleRequestAPI(id: string, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/sample-requests/${encodeURIComponent(id)}`, { data });
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, body: (await res.json())?.data };
}

async function deleteSampleRequestAPI(id: string) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/sample-requests/${encodeURIComponent(id)}`);
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, body: (await res.json())?.data };
}

async function submitSampleRequestAPI(id: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-requests/${encodeURIComponent(id)}/submit`);
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, body: (await res.json())?.data };
}

async function withdrawSampleRequestAPI(id: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-requests/${encodeURIComponent(id)}/withdraw`);
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, body: (await res.json())?.data };
}

async function receiveSampleRequestAPI(id: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-requests/${encodeURIComponent(id)}/receive`);
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, body: (await res.json())?.data };
}

async function updateLabDataAPI(id: string, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/sample-requests/${encodeURIComponent(id)}/lab`, { data });
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, body: (await res.json())?.data };
}

async function completeSampleRequestAPI(id: string, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-requests/${encodeURIComponent(id)}/complete`, { data });
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, body: (await res.json())?.data };
}

// ==================== 测试用例 ====================

test.beforeAll(async () => {
  await getApiContext();
  await cleanupTestData();
});

test.afterAll(async () => {
  await cleanupTestData();
  await disposeApiContext();
});

test.describe.serial('样品申请管理 E2E', () => {
  test.setTimeout(120_000);

  const ctx: {
    customerName?: string;
    requestNumber?: string;
  } = {};

  // ==================== 1. 准备测试数据 ====================

  test('1. 准备测试数据 - 查找客户', async () => {
    const customer = await findCustomer();
    expect(customer, '数据库中没有客户，无法测试').toBeTruthy();
    ctx.customerName = customer.customer_name;
    console.log(`  找到客户: ${customer.customer_number} - ${customer.customer_name}`);
  });

  // ==================== 2. 创建样品申请 ====================

  test('2. 创建样品申请（含自定义明细）', async () => {
    const result = await createSampleRequestAPI({
      request_date: '2026-05-30',
      deadline_date: '2026-06-15',
      applicant: 'E2E测试员',
      urgency: '紧急',
      customer_name: ctx.customerName,
      market: '汽车',
      competitor: '竞品A',
      estimated_price: 150.00,
      potential_usage: 5000,
      has_order: '是',
      coating_workpiece: '汽车保险杠',
      substrate: 'PP',
      pretreatment: '磷化',
      spray_gun_type: '静电枪',
      recovery_system: '旋风',
      oven_type: '天然气',
      color_spec: 'RAL9016',
      product_type: '底粉+面粉',
      film_thickness: '60-80μm',
      gloss_range: '80-90',
      curing_condition: '200°C/10min',
      other_requirements: TEST_MARKER,
      items: [
        { item_type: '样板', quantity: 5, unit: '片', is_requested: true, sort_order: 1 },
        { item_type: '样粉', quantity: 2, unit: '公斤', is_requested: true, sort_order: 2 },
        { item_type: '测试报告', quantity: 1, unit: '份', is_requested: true, sort_order: 3 },
      ],
    });

    expect(result, '创建API应返回申请编号').toBeTruthy();
    expect(result.request_number, '申请编号格式应为 SR-YYYYMMDD-NNN').toMatch(/^SR-\d{8}-\d{3}$/);
    ctx.requestNumber = result.request_number;
    console.log(`  创建样品申请: ${result.request_number}`);
  });

  // ==================== 3. DB断言 - 主表+明细 ====================

  test('3. DB断言 - 主表字段和明细行', async () => {
    const header = await getSampleRequest(ctx.requestNumber!);
    expect(header, '主表记录应存在').toBeTruthy();
    expect(header.customer_name).toBe(ctx.customerName);
    expect(header.applicant).toBe('E2E测试员');
    expect(header.urgency).toBe('紧急');
    expect(header.market).toBe('汽车');
    expect(header.competitor).toBe('竞品A');
    expect(Number(header.estimated_price)).toBeCloseTo(150.00, 1);
    expect(Number(header.potential_usage)).toBe(5000);
    expect(header.has_order).toBe('是');
    expect(header.coating_workpiece).toBe('汽车保险杠');
    expect(header.substrate).toBe('PP');
    expect(header.pretreatment).toBe('磷化');
    expect(header.spray_gun_type).toBe('静电枪');
    expect(header.recovery_system).toBe('旋风');
    expect(header.oven_type).toBe('天然气');
    expect(header.color_spec).toBe('RAL9016');
    expect(header.product_type).toBe('底粉+面粉');
    expect(header.film_thickness).toBe('60-80μm');
    expect(header.gloss_range).toBe('80-90');
    expect(header.curing_condition).toBe('200°C/10min');
    expect(header.other_requirements).toBe(TEST_MARKER);
    expect(header.status).toBe('草稿');
    expect(header.approval_status).toBe('草稿');
    expect(header.created_by).toBe('admin');

    const items = await getSampleRequestItems(ctx.requestNumber!);
    expect(items.length, '应有3条明细').toBe(3);

    expect(items[0].item_type).toBe('样板');
    expect(Number(items[0].quantity)).toBe(5);
    expect(items[0].unit).toBe('片');
    expect(items[0].is_requested).toBeTruthy();

    expect(items[1].item_type).toBe('样粉');
    expect(Number(items[1].quantity)).toBe(2);
    expect(items[1].unit).toBe('公斤');
    expect(items[1].is_requested).toBeTruthy();

    expect(items[2].item_type).toBe('测试报告');

    console.log('  ✅ 主表+明细DB断言通过');
  });

  // ==================== 4. 查询详情 API ====================

  test('4. 查询详情 API', async () => {
    const detail = await getSampleRequestDetailAPI(ctx.requestNumber!);
    expect(detail, '详情API应返回数据').toBeTruthy();
    expect(detail.header.request_number).toBe(ctx.requestNumber);
    expect(detail.header.customer_name).toBe(ctx.customerName);
    expect(detail.items.length).toBe(3);
    expect(detail.lab, '草稿阶段应无实验室数据').toBeNull();
    console.log('  ✅ 详情查询API通过');
  });

  // ==================== 5. 查询列表 API ====================

  test('5. 查询列表 API（筛选）', async () => {
    const list = await getSampleRequestListAPI({ search: ctx.customerName!, limit: '50' });
    expect(list.items.length, '列表应包含测试数据').toBeGreaterThanOrEqual(1);
    const found = list.items.some((i: any) => i.request_number === ctx.requestNumber);
    expect(found, '列表中应包含刚创建的申请').toBeTruthy();

    const draftList = await getSampleRequestListAPI({ status: '草稿', limit: '50' });
    const draftFound = draftList.items.some((i: any) => i.request_number === ctx.requestNumber);
    expect(draftFound, '草稿列表应包含新建申请').toBeTruthy();

    console.log(`  ✅ 列表查询API通过 (总计 ${list.pagination.total} 条)`);
  });

  // ==================== 6. 更新草稿 ====================

  test('6. 更新草稿（主表+明细替换）', async () => {
    const result = await updateSampleRequestAPI(ctx.requestNumber!, {
      request_date: '2026-06-01',
      deadline_date: '2026-06-20',
      applicant: 'E2E更新员',
      urgency: '一般',
      customer_name: ctx.customerName,
      market: '建筑',
      other_requirements: TEST_MARKER,
      items: [
        { item_type: '样板', quantity: 10, unit: '片', is_requested: true, sort_order: 1 },
        { item_type: '相溶性测试', quantity: 3, unit: '次', is_requested: true, sort_order: 2 },
      ],
    });

    expect(result.ok, '更新应成功').toBeTruthy();

    const header = await getSampleRequest(ctx.requestNumber!);
    expect(header.applicant).toBe('E2E更新员');
    expect(header.urgency).toBe('一般');
    expect(header.market).toBe('建筑');

    const items = await getSampleRequestItems(ctx.requestNumber!);
    expect(items.length, '明细应被替换为2条').toBe(2);
    expect(items[0].item_type).toBe('样板');
    expect(Number(items[0].quantity)).toBe(10);
    expect(items[1].item_type).toBe('相溶性测试');

    console.log('  ✅ 更新草稿+DB断言通过');
  });

  // ==================== 7. 提交（草稿→待研发） ====================

  test('7. 提交 - 草稿→待研发', async () => {
    const result = await submitSampleRequestAPI(ctx.requestNumber!);
    expect(result.ok, '提交应成功').toBeTruthy();

    const header = await getSampleRequest(ctx.requestNumber!);
    expect(header.status, '提交后状态应为待研发').toBe('待研发');
    expect(header.approval_status).toBe('待研发');

    console.log('  ✅ 提交流程通过');
  });

  // ==================== 8. 已提交不可编辑/删除 ====================

  test('8. 已提交不可编辑和删除', async () => {
    const updateResult = await updateSampleRequestAPI(ctx.requestNumber!, {
      applicant: '非法修改',
      other_requirements: TEST_MARKER,
    });
    expect(updateResult.ok, '已提交记录编辑应被拒绝').toBeFalsy();
    expect(updateResult.status).toBe(403);

    const deleteResult = await deleteSampleRequestAPI(ctx.requestNumber!);
    expect(deleteResult.ok, '已提交记录删除应被拒绝').toBeFalsy();
    expect(deleteResult.status).toBe(403);

    console.log('  ✅ 已提交保护逻辑通过');
  });

  // ==================== 9. 撤回（待研发→草稿） ====================

  test('9. 撤回 - 待研发→草稿', async () => {
    const result = await withdrawSampleRequestAPI(ctx.requestNumber!);
    expect(result.ok, '撤回应成功').toBeTruthy();

    const header = await getSampleRequest(ctx.requestNumber!);
    expect(header.status, '撤回后应为草稿').toBe('草稿');
    expect(header.approval_status).toBe('草稿');

    console.log('  ✅ 撤回流程通过');
  });

  // ==================== 10. 再次提交 → 接收（待研发→研发中） ====================

  test('10. 提交→接收 - 待研发→研发中（含实验室记录）', async () => {
    // 再次提交
    const submitResult = await submitSampleRequestAPI(ctx.requestNumber!);
    expect(submitResult.ok, '再次提交应成功').toBeTruthy();

    // 接收
    const receiveResult = await receiveSampleRequestAPI(ctx.requestNumber!);
    expect(receiveResult.ok, '接收应成功').toBeTruthy();

    const header = await getSampleRequest(ctx.requestNumber!);
    expect(header.status, '接收后应为研发中').toBe('研发中');
    expect(header.approval_status).toBe('研发中');

    // 验证实验室记录自动创建
    const lab = await getSampleRequestLab(ctx.requestNumber!);
    expect(lab, '接收时应自动创建实验室记录').toBeTruthy();
    expect(lab.received_by, '接收人应为admin').toBe('admin');
    expect(lab.received_at, '接收时间不应为空').toBeTruthy();

    console.log('  ✅ 接收流程+实验室记录通过');
  });

  // ==================== 11. 保存实验室数据 ====================

  test('11. 保存实验室数据（中途保存）', async () => {
    const result = await updateLabDataAPI(ctx.requestNumber!, {
      lab_panel_qty: 8,
      lab_powder_qty: 1.5,
      completion_date: '2026-06-10',
      product_number: 'E2E-PROD-001',
      formula_cost: 85.50,
      lab_remark: 'E2E测试实验室备注',
    });
    expect(result.ok, '保存实验室数据应成功').toBeTruthy();

    const lab = await getSampleRequestLab(ctx.requestNumber!);
    expect(Number(lab.lab_panel_qty)).toBe(8);
    expect(Number(lab.lab_powder_qty)).toBeCloseTo(1.5, 1);
    expect(lab.product_number).toBe('E2E-PROD-001');
    expect(Number(lab.formula_cost)).toBeCloseTo(85.50, 1);
    expect(lab.lab_remark).toBe('E2E测试实验室备注');

    console.log('  ✅ 实验室数据保存通过');
  });

  // ==================== 12. 完成研发（研发中→已完成） ====================

  test('12. 完成研发 - 研发中→已完成', async () => {
    const result = await completeSampleRequestAPI(ctx.requestNumber!, {
      lab_panel_qty: 8,
      lab_powder_qty: 1.5,
      completion_date: '2026-06-08',
      product_number: 'E2E-PROD-001',
      formula_cost: 80.00,
      lab_remark: '研发完成',
    });
    expect(result.ok, '完成应成功').toBeTruthy();

    const header = await getSampleRequest(ctx.requestNumber!);
    expect(header.status, '完成后应为已完成').toBe('已完成');
    expect(header.approval_status).toBe('已完成');

    const lab = await getSampleRequestLab(ctx.requestNumber!);
    expect(lab.completed_by, '完成人应为admin').toBe('admin');
    expect(lab.completed_at, '完成时间不应为空').toBeTruthy();
    expect(lab.lab_remark).toBe('研发完成');
    expect(Number(lab.formula_cost)).toBeCloseTo(80.00, 1);

    console.log('  ✅ 完成研发流程通过');
  });

  // ==================== 13. 非法状态转换 ====================

  test('13. 非法状态转换校验', async () => {
    // 已完成不可再接收
    const receiveResult = await receiveSampleRequestAPI(ctx.requestNumber!);
    expect(receiveResult.ok, '已完成不可接收').toBeFalsy();
    expect(receiveResult.status).toBe(403);

    // 已完成不可再完成
    const completeResult = await completeSampleRequestAPI(ctx.requestNumber!, {});
    expect(completeResult.ok, '已完成不可再完成').toBeFalsy();

    // 已完成不可撤回（只有待研发可撤回）
    const withdrawResult = await withdrawSampleRequestAPI(ctx.requestNumber!);
    expect(withdrawResult.ok, '已完成不可撤回').toBeFalsy();

    console.log('  ✅ 非法状态转换拦截通过');
  });

  // ==================== 14. 删除草稿 ====================

  test('14. 创建新草稿并删除', async () => {
    // 创建一个新的草稿用于删除测试
    const createResult = await createSampleRequestAPI({
      customer_name: ctx.customerName,
      applicant: '删除测试',
      other_requirements: TEST_MARKER,
    });
    expect(createResult.request_number).toBeTruthy();
    const rn = createResult.request_number;

    // 验证草稿状态
    const header = await getSampleRequest(rn);
    expect(header.status).toBe('草稿');

    // 删除
    const deleteResult = await deleteSampleRequestAPI(rn);
    expect(deleteResult.ok, '删除草稿应成功').toBeTruthy();

    // DB断言
    const deletedHeader = await getSampleRequest(rn);
    expect(deletedHeader, '主表应已删除').toBeFalsy();

    const items = await getSampleRequestItems(rn);
    expect(items.length, '明细应级联删除').toBe(0);

    console.log('  ✅ 删除草稿+级联删除通过');
  });

  // ==================== 15. 编号生成规则 ====================

  test('15. 编号生成规则 SR-YYYYMMDD-NNN', async () => {
    const r1 = await createSampleRequestAPI({ customer_name: ctx.customerName, other_requirements: TEST_MARKER });
    const r2 = await createSampleRequestAPI({ customer_name: ctx.customerName, other_requirements: TEST_MARKER });

    const rn1 = r1.request_number;
    const rn2 = r2.request_number;

    expect(rn1).toMatch(/^SR-\d{8}-\d{3}$/);
    expect(rn2).toMatch(/^SR-\d{8}-\d{3}$/);

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    expect(rn1).toContain(`SR-${today}-`);
    expect(rn2).toContain(`SR-${today}-`);

    const seq1 = parseInt(rn1.split('-')[2], 10);
    const seq2 = parseInt(rn2.split('-')[2], 10);
    expect(seq2, '第二条序号应大于第一条').toBeGreaterThan(seq1);

    console.log(`  编号1: ${rn1}, 编号2: ${rn2}`);
    console.log('  ✅ 编号生成规则验证通过');

    // 清理
    await deleteSampleRequestAPI(rn1);
    await deleteSampleRequestAPI(rn2);
  });

  // ==================== 16. 默认明细项 ====================

  test('16. 创建时无明细应自动生成默认明细项', async () => {
    const result = await createSampleRequestAPI({
      customer_name: ctx.customerName,
      applicant: '默认明细测试',
      other_requirements: TEST_MARKER,
      // 不传 items，应自动生成 DEFAULT_ITEM_TYPES
    });
    const rn = result.request_number;

    const items = await getSampleRequestItems(rn);
    expect(items.length, '应有5条默认明细').toBe(5);
    expect(items[0].item_type).toBe('样板');
    expect(items[1].item_type).toBe('样粉');
    expect(items[2].item_type).toBe('相溶性测试');
    expect(items[3].item_type).toBe('测试报告');
    expect(items[4].item_type).toBe('其他');

    console.log('  ✅ 默认明细项验证通过');

    // 清理
    await deleteSampleRequestAPI(rn);
  });
});
