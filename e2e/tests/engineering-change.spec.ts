/**
 * 工程更改管理 E2E 测试
 *
 * 测试策略：API 驱动 + DB 断言（纯API，无UI操作）
 *
 * 核心概念：
 *   - 主表（lifecycle）：一个产品一条记录，贯穿全生命周期
 *   - 子表（log）：同一产品下可有多条变更日志
 *   - 状态机：进行中 → 已完成 → 已关闭（任意状态可回退到进行中，无审批）
 *   - 聚合字段自动维护：change_count / latest_change_type / latest_change_at
 *
 * 测试场景：
 *   1. 创建生命周期记录
 *   2. Upsert - 同一产品编号不重复创建
 *   3. DB断言 - 主表字段
 *   4. 查询详情 API
 *   5. 查询列表 API（筛选）
 *   6. 编辑主表
 *   7. 新增变更日志
 *   8. DB断言 - 变更日志 + 聚合字段自动刷新
 *   9. 连续新增日志 - change_seq 递增 + 聚合字段更新
 *  10. 编辑变更日志 + 聚合字段刷新
 *  11. 删除变更日志 + 聚合字段刷新
 *  12. 状态流转：进行中 → 已完成
 *  13. 状态流转：已完成 → 已关闭
 *  14. 状态回退：已关闭 → 进行中
 *  15. 非法状态流转拦截
 *  16. 有变更日志不可删除主表
 *  17. 删除主表（清空日志后）
 *  18. 变更类型字典 API
 */
import { test, expect } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import { getApiContext, disposeApiContext } from '../helpers/api.helper';

const API_BASE = 'http://localhost:3000/api/v1';
const TEST_MARKER = `E2E-EC-${Date.now()}`;
const TEST_PRODUCT = `E2E-PROD-${Date.now()}`;

// ==================== DB 辅助函数 ====================

/** 查找可用成品物料 */
async function findFinishedItem() {
  const rows = await query<any>(
    `SELECT TOP 1 item_number, item_name FROM item_master WHERE item_type = N'成品'`
  );
  return rows[0] || null;
}

/** 查找可用客户 */
async function findCustomer() {
  const rows = await query<any>(
    `SELECT TOP 1 customer_number, customer_name FROM customer`
  );
  return rows[0] || null;
}

/** 查询生命周期主表 */
async function getLifecycle(id: number) {
  const rows = await query<any>(
    `SELECT id, product_number, product_name, customer_number, customer_name,
            origin_sample_request_no, sample_pass_date, lifecycle_status,
            change_count, latest_change_type, latest_change_at,
            remark, created_by, updated_by, created_at, updated_at
     FROM engineering_change_lifecycle WHERE id = @id`,
    { id: { type: T.Int, value: id } }
  );
  return rows[0] || null;
}

/** 按产品编号查询生命周期 */
async function getLifecycleByProduct(productNumber: string) {
  const rows = await query<any>(
    `SELECT id, product_number, lifecycle_status, change_count, latest_change_type
     FROM engineering_change_lifecycle WHERE product_number = @pn`,
    { pn: { type: T.NVarChar, value: productNumber } }
  );
  return rows[0] || null;
}

/** 查询变更日志 */
async function getChangeLogs(lifecycleId: number) {
  return await query<any>(
    `SELECT id, lifecycle_id, product_number, change_seq, change_date, change_type,
            change_summary, change_detail, before_value, after_value,
            related_sample_request_no, related_routing_id, related_bom_id,
            handled_by, attachment_url, created_by
     FROM engineering_change_log WHERE lifecycle_id = @lid ORDER BY change_seq`,
    { lid: { type: T.Int, value: lifecycleId } }
  );
}

/** 清理测试数据 */
async function cleanupTestData() {
  // 按备注标记清理（主表 remark 字段）
  const lifecycles = await query<any>(
    `SELECT id FROM engineering_change_lifecycle WHERE remark = @mk`,
    { mk: { type: T.NVarChar, value: TEST_MARKER } }
  );
  for (const lc of lifecycles) {
    await query(`DELETE FROM engineering_change_log WHERE lifecycle_id = @lid`, { lid: { type: T.Int, value: lc.id } });
  }
  await query(`DELETE FROM engineering_change_lifecycle WHERE remark = @mk`, { mk: { type: T.NVarChar, value: TEST_MARKER } });

  // 也按产品编号清理（E2E-PROD- 前缀）
  const testLifecycles = await query<any>(
    `SELECT id FROM engineering_change_lifecycle WHERE product_number LIKE @pn`,
    { pn: { type: T.NVarChar, value: 'E2E-PROD-%' } }
  );
  for (const lc of testLifecycles) {
    await query(`DELETE FROM engineering_change_log WHERE lifecycle_id = @lid`, { lid: { type: T.Int, value: lc.id } });
  }
  await query(`DELETE FROM engineering_change_lifecycle WHERE product_number LIKE @pn`, { pn: { type: T.NVarChar, value: 'E2E-PROD-%' } });

  console.log(`[Cleanup] 清理工程更改测试数据 ${lifecycles.length + testLifecycles.length} 条`);
}

// ==================== API 辅助函数 ====================

async function createLifecycleAPI(data: any) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/engineering-change-lifecycles`, { data });
  if (!res.ok()) throw new Error(`创建失败 ${res.status()}: ${await res.text()}`);
  return (await res.json())?.data;
}

async function getLifecycleDetailAPI(id: number) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/engineering-change-lifecycles/${id}`);
  if (!res.ok()) throw new Error(`获取详情失败 ${res.status()}: ${await res.text()}`);
  return (await res.json())?.data;
}

async function getLifecycleListAPI(params?: Record<string, string>) {
  const ctx = await getApiContext();
  const qs = new URLSearchParams(params || {}).toString();
  const url = `${API_BASE}/engineering-change-lifecycles${qs ? '?' + qs : ''}`;
  const res = await ctx.get(url);
  if (!res.ok()) throw new Error(`查询列表失败 ${res.status()}: ${await res.text()}`);
  return (await res.json())?.data;
}

async function updateLifecycleAPI(id: number, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/engineering-change-lifecycles/${id}`, { data });
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, body: (await res.json())?.data };
}

async function deleteLifecycleAPI(id: number) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/engineering-change-lifecycles/${id}`);
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, body: (await res.json())?.data };
}

async function updateLifecycleStatusAPI(id: number, lifecycle_status: string) {
  const ctx = await getApiContext();
  const res = await ctx.patch(`${API_BASE}/engineering-change-lifecycles/${id}/status`, { data: { lifecycle_status } });
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, body: (await res.json())?.data };
}

async function getLogsAPI(id: number) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/engineering-change-lifecycles/${id}/logs`);
  if (!res.ok()) throw new Error(`获取日志失败 ${res.status()}: ${await res.text()}`);
  return (await res.json())?.data;
}

async function createLogAPI(id: number, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/engineering-change-lifecycles/${id}/logs`, { data });
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, body: (await res.json())?.data };
}

async function updateLogAPI(id: number, logId: number, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/engineering-change-lifecycles/${id}/logs/${logId}`, { data });
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, body: (await res.json())?.data };
}

async function deleteLogAPI(id: number, logId: number) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/engineering-change-lifecycles/${id}/logs/${logId}`);
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, body: (await res.json())?.data };
}

async function getChangeTypesAPI() {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/engineering-change-lifecycles/change-types`);
  if (!res.ok()) throw new Error(`获取变更类型失败 ${res.status()}: ${await res.text()}`);
  return (await res.json())?.data;
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

test.describe.serial('工程更改管理 E2E', () => {
  test.setTimeout(120_000);

  const ctx: {
    productNumber?: string;
    productName?: string;
    customerNumber?: string;
    customerName?: string;
    lifecycleId?: number;
    logId1?: number;
    logId2?: number;
  } = {};

  // ==================== 1. 准备测试数据 ====================

  test('1. 准备测试数据 - 查找成品和客户', async () => {
    const item = await findFinishedItem();
    expect(item, '数据库中没有成品物料').toBeTruthy();
    ctx.productNumber = item.item_number;
    ctx.productName = item.item_name;
    console.log(`  找到成品: ${item.item_number} - ${item.item_name}`);

    const customer = await findCustomer();
    if (customer) {
      ctx.customerNumber = customer.customer_number;
      ctx.customerName = customer.customer_name;
      console.log(`  找到客户: ${customer.customer_number} - ${customer.customer_name}`);
    }
  });

  // ==================== 2. 创建生命周期记录 ====================

  test('2. 创建生命周期记录', async () => {
    const result = await createLifecycleAPI({
      product_number: TEST_PRODUCT,
      product_name: 'E2E测试产品',
      customer_number: ctx.customerNumber || null,
      customer_name: ctx.customerName || null,
      origin_sample_request_no: null,
      sample_pass_date: '2026-05-01',
      remark: TEST_MARKER,
    });

    expect(result, '创建API应返回id').toBeTruthy();
    expect(result.id, '应返回新记录ID').toBeTruthy();
    expect(result.existed, '新创建不应标记为已存在').toBeFalsy();
    ctx.lifecycleId = result.id;
    console.log(`  创建生命周期: ID=${result.id}`);
  });

  // ==================== 3. Upsert - 同一产品不重复 ====================

  test('3. Upsert - 同一产品编号返回已有记录', async () => {
    const result = await createLifecycleAPI({
      product_number: TEST_PRODUCT,
      product_name: '重复创建尝试',
      remark: TEST_MARKER,
    });

    expect(result.existed, '重复创建应标记为已存在').toBeTruthy();
    expect(result.id, '应返回原记录ID').toBe(ctx.lifecycleId);
    console.log('  ✅ 同一产品编号Upsert去重通过');
  });

  // ==================== 4. DB断言 - 主表 ====================

  test('4. DB断言 - 主表字段', async () => {
    const lc = await getLifecycle(ctx.lifecycleId!);
    expect(lc, '主表记录应存在').toBeTruthy();
    expect(lc.product_number).toBe(TEST_PRODUCT);
    expect(lc.product_name).toBe('E2E测试产品');
    expect(lc.customer_number).toBe(ctx.customerNumber || null);
    expect(lc.customer_name).toBe(ctx.customerName || null);
    expect(lc.sample_pass_date).toBeTruthy();
    expect(lc.lifecycle_status).toBe('进行中');
    expect(Number(lc.change_count)).toBe(0);
    expect(lc.latest_change_type).toBeNull();
    expect(lc.latest_change_at).toBeNull();
    expect(lc.remark).toBe(TEST_MARKER);
    expect(lc.created_by).toBe('admin');
    console.log('  ✅ 主表DB断言通过');
  });

  // ==================== 5. 查询详情 API ====================

  test('5. 查询详情 API', async () => {
    const detail = await getLifecycleDetailAPI(ctx.lifecycleId!);
    expect(detail.header.id).toBe(ctx.lifecycleId);
    expect(detail.header.product_number).toBe(TEST_PRODUCT);
    expect(detail.logs.length, '新创建应无日志').toBe(0);
    console.log('  ✅ 详情查询API通过');
  });

  // ==================== 6. 查询列表 API ====================

  test('6. 查询列表 API（筛选）', async () => {
    const list = await getLifecycleListAPI({ search: TEST_PRODUCT, limit: '50' });
    expect(list.items.length).toBeGreaterThanOrEqual(1);
    const found = list.items.some((i: any) => i.id === ctx.lifecycleId);
    expect(found).toBeTruthy();

    const statusList = await getLifecycleListAPI({ status: '进行中', limit: '50' });
    const statusFound = statusList.items.some((i: any) => i.id === ctx.lifecycleId);
    expect(statusFound).toBeTruthy();

    console.log(`  ✅ 列表查询API通过 (总计 ${list.pagination.total} 条)`);
  });

  // ==================== 7. 编辑主表 ====================

  test('7. 编辑主表', async () => {
    const result = await updateLifecycleAPI(ctx.lifecycleId!, {
      product_name: 'E2E更新后产品名',
      customer_number: ctx.customerNumber || null,
      customer_name: ctx.customerName || null,
      origin_sample_request_no: 'SR-20260530-001',
      sample_pass_date: '2026-05-15',
      remark: TEST_MARKER,
    });
    expect(result.ok).toBeTruthy();

    const lc = await getLifecycle(ctx.lifecycleId!);
    expect(lc.product_name).toBe('E2E更新后产品名');
    expect(lc.origin_sample_request_no).toBe('SR-20260530-001');
    expect(lc.sample_pass_date).toBeTruthy();
    expect(lc.updated_by).toBe('admin');

    console.log('  ✅ 编辑主表通过');
  });

  // ==================== 8. 新增变更日志 ====================

  test('8. 新增变更日志 + 聚合字段自动刷新', async () => {
    const result = await createLogAPI(ctx.lifecycleId!, {
      change_date: '2026-05-20',
      change_type: '样件通过',
      change_summary: '首次样件通过验证',
      change_detail: '密炼工艺参数调整后样件合格',
      before_value: '螺杆转速40rpm',
      after_value: '螺杆转速45rpm',
      handled_by: '张工',
    });
    expect(result.ok).toBeTruthy();
    expect(result.body.change_seq, '第一条日志序号应为1').toBe(1);
    ctx.logId1 = result.body.id;

    // DB断言 - 日志
    const logs = await getChangeLogs(ctx.lifecycleId!);
    expect(logs.length).toBe(1);
    expect(logs[0].change_type).toBe('样件通过');
    expect(logs[0].change_summary).toBe('首次样件通过验证');
    expect(logs[0].change_detail).toBe('密炼工艺参数调整后样件合格');
    expect(logs[0].before_value).toBe('螺杆转速40rpm');
    expect(logs[0].after_value).toBe('螺杆转速45rpm');
    expect(logs[0].handled_by).toBe('张工');
    expect(logs[0].created_by).toBe('admin');
    expect(logs[0].product_number).toBe(TEST_PRODUCT);

    // 聚合字段断言
    const lc = await getLifecycle(ctx.lifecycleId!);
    expect(Number(lc.change_count), 'change_count应为1').toBe(1);
    expect(lc.latest_change_type, '最新变更类型').toBe('样件通过');
    expect(lc.latest_change_at, '最新变更日期不应为空').toBeTruthy();

    console.log('  ✅ 新增变更日志+聚合刷新通过');
  });

  // ==================== 9. 连续新增日志 ====================

  test('9. 连续新增日志 - change_seq递增 + 聚合字段更新', async () => {
    const result = await createLogAPI(ctx.lifecycleId!, {
      change_date: '2026-05-25',
      change_type: '客户要求变更',
      change_summary: '客户要求颜色调整',
      change_detail: 'RAL9016改为RAL9010',
      before_value: 'RAL9016',
      after_value: 'RAL9010',
      handled_by: '李工',
    });
    expect(result.ok).toBeTruthy();
    expect(result.body.change_seq, '第二条日志序号应为2').toBe(2);
    ctx.logId2 = result.body.id;

    // 聚合字段断言 - 应更新为最新日志
    const lc = await getLifecycle(ctx.lifecycleId!);
    expect(Number(lc.change_count), 'change_count应为2').toBe(2);
    expect(lc.latest_change_type, '最新变更类型应更新').toBe('客户要求变更');

    // 日志列表API
    const logs = await getLogsAPI(ctx.lifecycleId!);
    expect(logs.length).toBe(2);

    console.log('  ✅ 连续新增日志+聚合更新通过');
  });

  // ==================== 10. 编辑变更日志 ====================

  test('10. 编辑变更日志 + 聚合字段刷新', async () => {
    // 编辑第二条日志
    const result = await updateLogAPI(ctx.lifecycleId!, ctx.logId2!, {
      change_date: '2026-05-26',
      change_type: '工艺调整',
      change_summary: '挤出工艺参数优化',
      change_detail: '挤出速度从12提升至14',
      before_value: '12m/min',
      after_value: '14m/min',
      handled_by: '王工',
    });
    expect(result.ok).toBeTruthy();

    // 聚合字段 - 最新类型应更新
    const lc = await getLifecycle(ctx.lifecycleId!);
    expect(lc.latest_change_type, '最新变更类型应为工艺调整').toBe('工艺调整');

    // DB断言
    const logs = await getChangeLogs(ctx.lifecycleId!);
    const edited = logs.find((l: any) => l.id === ctx.logId2);
    expect(edited.change_type).toBe('工艺调整');
    expect(edited.change_summary).toBe('挤出工艺参数优化');
    expect(edited.after_value).toBe('14m/min');

    console.log('  ✅ 编辑变更日志+聚合刷新通过');
  });

  // ==================== 11. 删除变更日志 + 聚合刷新 ====================

  test('11. 删除变更日志 + 聚合字段刷新', async () => {
    // 删除第二条日志
    const result = await deleteLogAPI(ctx.lifecycleId!, ctx.logId2!);
    expect(result.ok).toBeTruthy();

    // 聚合字段 - 应回退到第一条日志
    const lc = await getLifecycle(ctx.lifecycleId!);
    expect(Number(lc.change_count), 'change_count应回退为1').toBe(1);
    expect(lc.latest_change_type, '最新类型应回退为样件通过').toBe('样件通过');

    const logs = await getChangeLogs(ctx.lifecycleId!);
    expect(logs.length).toBe(1);

    console.log('  ✅ 删除变更日志+聚合刷新通过');
  });

  // ==================== 12. 状态流转：进行中 → 已完成 ====================

  test('12. 状态流转 - 进行中→已完成', async () => {
    const result = await updateLifecycleStatusAPI(ctx.lifecycleId!, '已完成');
    expect(result.ok).toBeTruthy();

    const lc = await getLifecycle(ctx.lifecycleId!);
    expect(lc.lifecycle_status).toBe('已完成');

    console.log('  ✅ 进行中→已完成通过');
  });

  // ==================== 13. 状态流转：已完成 → 已关闭 ====================

  test('13. 状态流转 - 已完成→已关闭', async () => {
    const result = await updateLifecycleStatusAPI(ctx.lifecycleId!, '已关闭');
    expect(result.ok).toBeTruthy();

    const lc = await getLifecycle(ctx.lifecycleId!);
    expect(lc.lifecycle_status).toBe('已关闭');

    console.log('  ✅ 已完成→已关闭通过');
  });

  // ==================== 14. 状态回退：已关闭 → 进行中 ====================

  test('14. 状态回退 - 已关闭→进行中', async () => {
    const result = await updateLifecycleStatusAPI(ctx.lifecycleId!, '进行中');
    expect(result.ok, '任意状态可回退到进行中').toBeTruthy();

    const lc = await getLifecycle(ctx.lifecycleId!);
    expect(lc.lifecycle_status).toBe('进行中');

    console.log('  ✅ 已关闭→进行中回退通过');
  });

  // ==================== 15. 非法状态流转 ====================

  test('15. 非法状态流转拦截', async () => {
    // 进行中不可直接跳到已关闭（需先到已完成）
    const result = await updateLifecycleStatusAPI(ctx.lifecycleId!, '已关闭');
    expect(result.ok, '进行中不可直接到已关闭').toBeFalsy();
    expect(result.status).toBe(400);

    // 无效状态值
    const invalidResult = await updateLifecycleStatusAPI(ctx.lifecycleId!, '无效状态');
    expect(invalidResult.ok).toBeFalsy();
    expect(invalidResult.status).toBe(400);

    // 相同状态不报错但不变
    const sameResult = await updateLifecycleStatusAPI(ctx.lifecycleId!, '进行中');
    expect(sameResult.ok).toBeTruthy();

    console.log('  ✅ 非法状态流转拦截通过');
  });

  // ==================== 16. 有日志不可删除主表 ====================

  test('16. 有变更日志不可删除主表', async () => {
    const result = await deleteLifecycleAPI(ctx.lifecycleId!);
    expect(result.ok, '有日志时删除主表应被拒绝').toBeFalsy();
    expect(result.status).toBe(403);

    console.log('  ✅ 有日志保护逻辑通过');
  });

  // ==================== 17. 清空日志后删除主表 ====================

  test('17. 清空日志后删除主表', async () => {
    // 先删除唯一的日志
    const delLogResult = await deleteLogAPI(ctx.lifecycleId!, ctx.logId1!);
    expect(delLogResult.ok).toBeTruthy();

    // 聚合字段应清零
    const lc = await getLifecycle(ctx.lifecycleId!);
    expect(Number(lc.change_count)).toBe(0);
    expect(lc.latest_change_type).toBeNull();

    // 现在可以删除主表
    const delResult = await deleteLifecycleAPI(ctx.lifecycleId!);
    expect(delResult.ok, '清空日志后删除应成功').toBeTruthy();

    // DB断言
    const deletedLc = await getLifecycle(ctx.lifecycleId!);
    expect(deletedLc, '主表应已删除').toBeFalsy();

    console.log('  ✅ 清空日志后删除主表通过');
  });

  // ==================== 18. 变更类型字典 API ====================

  test('18. 变更类型字典 API', async () => {
    const types = await getChangeTypesAPI();
    expect(types, '应返回变更类型数组').toBeTruthy();
    expect(types).toContain('样件通过');
    expect(types).toContain('客户要求变更');
    expect(types).toContain('工艺调整');
    expect(types).toContain('其他');
    expect(types.length).toBe(4);

    console.log(`  ✅ 变更类型字典API通过 (${types.join(', ')})`);
  });

  // ==================== 19. 完整生命周期流程 ====================

  test('19. 完整生命周期流程（创建→加日志→状态推进→回退）', async () => {
    // 创建
    const createResult = await createLifecycleAPI({
      product_number: `E2E-FLOW-${Date.now()}`,
      product_name: '完整流程测试',
      remark: TEST_MARKER,
    });
    const lid = createResult.id;

    // 加3条日志
    await createLogAPI(lid, { change_date: '2026-06-01', change_type: '样件通过', change_summary: '日志1' });
    await createLogAPI(lid, { change_date: '2026-06-05', change_type: '客户要求变更', change_summary: '日志2' });
    await createLogAPI(lid, { change_date: '2026-06-10', change_type: '工艺调整', change_summary: '日志3' });

    const lc = await getLifecycle(lid);
    expect(Number(lc.change_count)).toBe(3);
    expect(lc.latest_change_type).toBe('工艺调整');

    // 状态推进：进行中→已完成→已关闭
    await updateLifecycleStatusAPI(lid, '已完成');
    await updateLifecycleStatusAPI(lid, '已关闭');
    const closedLc = await getLifecycle(lid);
    expect(closedLc.lifecycle_status).toBe('已关闭');

    // 回退：已关闭→进行中
    await updateLifecycleStatusAPI(lid, '进行中');
    const reopenedLc = await getLifecycle(lid);
    expect(reopenedLc.lifecycle_status).toBe('进行中');

    // 清理
    const logs = await getChangeLogs(lid);
    for (const log of logs) {
      await deleteLogAPI(lid, log.id);
    }
    await deleteLifecycleAPI(lid);

    console.log('  ✅ 完整生命周期流程通过');
  });
});
