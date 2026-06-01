/**
 * 工艺参数管理 E2E 测试
 *
 * 测试策略：API 驱动 + DB 断言（纯API，无UI操作）
 *
 * 测试场景：
 *   1. 创建产品级工艺参数（process_route_number=NULL）
 *   2. 创建工艺路线级工艺参数
 *   3. 查询列表 / 详情 / 按产品查询 / 按路线查询（优先级逻辑）
 *   4. 更新草稿（主表+明细全量替换）
 *   5. 审批流程（提交 → 审批）
 *   6. 已审批记录不可编辑/删除
 *   7. 反审（已审批 → 草稿）
 *   8. 删除草稿
 *   9. 编号生成规则 PP-YYYYMMDD-NNN
 */
import { test, expect } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import {
  apiLogin,
  getApiContext,
  disposeApiContext,
  submitAndApprove,
} from '../helpers/api.helper';

const API_BASE = 'http://localhost:3000/api/v1';
const TEST_MARKER = `E2E-PP-${Date.now()}`;

// ==================== DB 辅助函数 ====================

/** 查找可用的成品物料 */
async function findFinishedItem() {
  const rows = await query<any>(
    `SELECT TOP 1 item_number, item_name FROM item_master WHERE item_type = N'成品'`
  );
  return rows[0] || null;
}

/** 查找可用的工艺路线 */
async function findActiveRoute(itemNumber: string) {
  const rows = await query<any>(
    `SELECT TOP 1 process_route_number, process_route_name FROM routing_header WHERE item_number = @item AND [condition] = N'启用' AND approval_status = N'已审批'`,
    { item: { type: T.NVarChar, value: itemNumber } }
  );
  return rows[0] || null;
}

/** 查询工艺参数主表 */
async function getParameterHeader(parameterNumber: string) {
  const rows = await query<any>(
    `SELECT id, parameter_number, item_number, item_name, process_route_number, version, description, approval_status, [condition], creation_date, creation_man, remark
     FROM process_parameter_header WHERE parameter_number = @pn`,
    { pn: { type: T.NVarChar, value: parameterNumber } }
  );
  return rows[0] || null;
}

/** 查询工艺参数明细 */
async function getParameterDetails(parameterNumber: string) {
  return await query<any>(
    `SELECT id, parameter_number, line_number, step_number, step_name, param_name, param_code, param_value, unit, param_type, min_value, max_value, is_required, remark
     FROM process_parameter_detail WHERE parameter_number = @pn ORDER BY line_number`,
    { pn: { type: T.NVarChar, value: parameterNumber } }
  );
}

/** 清理测试数据 */
async function cleanupTestData() {
  const headers = await query<any>(
    `SELECT parameter_number FROM process_parameter_header WHERE remark = @mk`,
    { mk: { type: T.NVarChar, value: TEST_MARKER } }
  );
  for (const h of headers) {
    await query(
      `DELETE FROM process_parameter_detail WHERE parameter_number = @pn`,
      { pn: { type: T.NVarChar, value: h.parameter_number } }
    );
  }
  await query(
    `DELETE FROM process_parameter_header WHERE remark = @mk`,
    { mk: { type: T.NVarChar, value: TEST_MARKER } }
  );
  console.log(`[Cleanup] 清理工艺参数测试数据 ${headers.length} 条`);
}

// ==================== API 辅助函数 ====================

/** 创建工艺参数 */
async function createParameterAPI(data: any) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/process-parameters`, { data });
  if (!res.ok()) {
    throw new Error(`创建工艺参数失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 获取工艺参数详情 */
async function getParameterDetailAPI(id: number) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/process-parameters/${id}`);
  if (!res.ok()) {
    throw new Error(`获取工艺参数详情失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 更新工艺参数 */
async function updateParameterAPI(id: number, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/process-parameters/${id}`, { data });
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  const body = await res.json();
  return { ok: true, body: body?.data };
}

/** 删除工艺参数 */
async function deleteParameterAPI(id: number) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/process-parameters/${id}`);
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  const body = await res.json();
  return { ok: true, body: body?.data };
}

/** 查询工艺参数列表 */
async function getParameterListAPI(params?: Record<string, string>) {
  const ctx = await getApiContext();
  const qs = new URLSearchParams(params || {}).toString();
  const url = `${API_BASE}/process-parameters${qs ? '?' + qs : ''}`;
  const res = await ctx.get(url);
  if (!res.ok()) {
    throw new Error(`查询工艺参数列表失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 按产品查询生效参数 */
async function getParametersByItemAPI(itemNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/process-parameters/by-item/${encodeURIComponent(itemNumber)}`);
  if (!res.ok()) {
    throw new Error(`按产品查询参数失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 按产品+工艺路线查询生效参数 */
async function getParametersByRouteAPI(itemNumber: string, routeNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(
    `${API_BASE}/process-parameters/by-route/${encodeURIComponent(itemNumber)}/${encodeURIComponent(routeNumber)}`
  );
  if (!res.ok()) {
    throw new Error(`按路线查询参数失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
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

test.describe.serial('工艺参数管理 E2E', () => {
  test.setTimeout(120_000);

  const ctx: {
    itemNumber?: string;
    itemName?: string;
    routeNumber?: string;
    routeName?: string;
    productParamNumber?: string;
    productParamId?: number;
    routeParamNumber?: string;
    routeParamId?: number;
  } = {};

  // ==================== 1. 准备测试数据 ====================

  test('1. 准备测试数据 - 查找成品物料和工艺路线', async () => {
    const item = await findFinishedItem();
    expect(item, '数据库中没有成品物料，无法测试').toBeTruthy();
    ctx.itemNumber = item.item_number;
    ctx.itemName = item.item_name;
    console.log(`  找到成品: ${item.item_number} - ${item.item_name}`);

    const route = await findActiveRoute(item.item_number);
    if (route) {
      ctx.routeNumber = route.process_route_number;
      ctx.routeName = route.process_route_name;
      console.log(`  找到工艺路线: ${route.process_route_number} - ${route.process_route_name}`);
    } else {
      console.log('  未找到工艺路线，将仅测试产品级参数');
    }
  });

  // ==================== 2. 创建产品级工艺参数 ====================

  test('2. 创建产品级工艺参数（process_route_number=NULL）', async () => {
    const result = await createParameterAPI({
      item_number: ctx.itemNumber,
      item_name: ctx.itemName,
      process_route_number: null,
      version: 1,
      description: 'E2E产品级参数',
      remark: TEST_MARKER,
      details: [
        { step_number: 10, step_name: '密炼', param_name: '螺杆转速', param_code: 'SCREW_SPEED', param_value: '45', unit: 'rpm', param_type: '输入', min_value: '30', max_value: '60', is_required: 'Y' },
        { step_number: 10, step_name: '密炼', param_name: '温度设定', param_code: 'TEMP_SET', param_value: '110/100', unit: '°C', param_type: '输入', min_value: '90', max_value: '120', is_required: 'Y' },
        { step_number: 20, step_name: '挤出', param_name: '挤出速度', param_code: 'EXT_SPEED', param_value: '12', unit: 'm/min', param_type: '输入', min_value: '8', max_value: '15', is_required: 'N' },
      ],
    });

    expect(result, '创建API应返回参数编号').toBeTruthy();
    expect(result.parameter_number, '参数编号格式应为 PP-YYYYMMDD-NNN').toMatch(/^PP-\d{8}-\d{3}$/);
    ctx.productParamNumber = result.parameter_number;
    console.log(`  创建产品级参数: ${result.parameter_number}`);
  });

  // ==================== 3. DB 断言 - 产品级参数主表+明细 ====================

  test('3. DB断言 - 产品级参数主表和明细', async () => {
    const header = await getParameterHeader(ctx.productParamNumber!);
    expect(header, '主表记录应存在').toBeTruthy();
    expect(header.item_number).toBe(ctx.itemNumber);
    expect(header.item_name).toBe(ctx.itemName);
    expect(header.process_route_number).toBeNull();
    expect(header.version).toBe(1);
    expect(header.description).toBe('E2E产品级参数');
    expect(header.approval_status).toBe('草稿');
    expect(header.condition).toBe('启用');
    expect(header.remark).toBe(TEST_MARKER);
    ctx.productParamId = header.id;

    const details = await getParameterDetails(ctx.productParamNumber!);
    expect(details.length, '应有3条明细').toBe(3);

    // 行号自动递增 10, 20, 30
    expect(details[0].line_number).toBe(10);
    expect(details[0].param_name).toBe('螺杆转速');
    expect(details[0].param_code).toBe('SCREW_SPEED');
    expect(details[0].param_value).toBe('45');
    expect(details[0].unit).toBe('rpm');
    expect(details[0].param_type).toBe('输入');
    expect(details[0].min_value).toBe('30');
    expect(details[0].max_value).toBe('60');
    expect(details[0].is_required).toBe('Y');

    expect(details[1].param_name).toBe('温度设定');
    expect(details[2].param_name).toBe('挤出速度');
    expect(details[2].is_required).toBe('N');

    console.log('  ✅ 产品级参数主表+明细DB断言通过');
  });

  // ==================== 4. 创建工艺路线级参数 ====================

  test('4. 创建工艺路线级参数（如有工艺路线）', async () => {
    if (!ctx.routeNumber) {
      console.log('  ⏭ 无工艺路线，跳过路线级参数测试');
      return;
    }

    const result = await createParameterAPI({
      item_number: ctx.itemNumber,
      item_name: ctx.itemName,
      process_route_number: ctx.routeNumber,
      version: 1,
      description: 'E2E路线级参数',
      remark: TEST_MARKER,
      details: [
        { step_number: 10, step_name: '密炼', param_name: '螺杆转速', param_code: 'SCREW_SPEED', param_value: '50', unit: 'rpm', param_type: '输入', min_value: '35', max_value: '65', is_required: 'Y' },
        { step_number: 20, step_name: '研磨', param_name: '筛网目数', param_code: 'MESH_SIZE', param_value: '80', unit: '目', param_type: '约束', min_value: '60', max_value: '100', is_required: 'Y' },
      ],
    });

    expect(result, '创建API应返回参数编号').toBeTruthy();
    expect(result.parameter_number).toMatch(/^PP-\d{8}-\d{3}$/);
    ctx.routeParamNumber = result.parameter_number;
    console.log(`  创建路线级参数: ${result.parameter_number}`);

    // DB断言
    const header = await getParameterHeader(result.parameter_number);
    expect(header.process_route_number).toBe(ctx.routeNumber);
    ctx.routeParamId = header.id;

    const details = await getParameterDetails(result.parameter_number);
    expect(details.length).toBe(2);
    expect(details[0].param_value).toBe('50'); // 路线级覆盖值
    expect(details[1].param_name).toBe('筛网目数');

    console.log('  ✅ 路线级参数创建+DB断言通过');
  });

  // ==================== 5. 查询详情 API ====================

  test('5. 查询工艺参数详情 API', async () => {
    const detail = await getParameterDetailAPI(ctx.productParamId!);
    expect(detail, '详情API应返回数据').toBeTruthy();
    expect(detail.header.parameter_number).toBe(ctx.productParamNumber);
    expect(detail.header.item_number).toBe(ctx.itemNumber);
    expect(detail.details.length).toBe(3);
    expect(detail.details[0].param_name).toBe('螺杆转速');
    console.log('  ✅ 详情查询API通过');
  });

  // ==================== 6. 查询列表 API ====================

  test('6. 查询工艺参数列表 API（筛选）', async () => {
    // 按产品编号筛选
    const list = await getParameterListAPI({ item_number: ctx.itemNumber!, limit: '50' });
    expect(list.items.length, '列表应包含测试数据').toBeGreaterThanOrEqual(1);
    const found = list.items.some((i: any) => i.parameter_number === ctx.productParamNumber);
    expect(found, '列表中应包含刚创建的产品级参数').toBeTruthy();

    // 按审批状态筛选
    const draftList = await getParameterListAPI({ approval_status: '草稿', limit: '50' });
    const draftFound = draftList.items.some((i: any) => i.parameter_number === ctx.productParamNumber);
    expect(draftFound, '草稿列表应包含新建参数').toBeTruthy();

    console.log(`  ✅ 列表查询API通过 (总计 ${list.pagination.total} 条)`);
  });

  // ==================== 7. 更新草稿 ====================

  test('7. 更新草稿参数（主表+明细全量替换）', async () => {
    const result = await updateParameterAPI(ctx.productParamId!, {
      item_number: ctx.itemNumber,
      item_name: ctx.itemName,
      process_route_number: null,
      version: 2,
      description: 'E2E更新后参数',
      remark: TEST_MARKER,
      details: [
        { step_number: 10, step_name: '密炼', param_name: '螺杆转速', param_code: 'SCREW_SPEED', param_value: '55', unit: 'rpm', param_type: '输入', min_value: '35', max_value: '70', is_required: 'Y' },
        { step_number: 30, step_name: '硫化', param_name: '硫化温度', param_code: 'VULC_TEMP', param_value: '160', unit: '°C', param_type: '输入', min_value: '150', max_value: '170', is_required: 'Y' },
      ],
    });

    expect(result.ok, '更新应成功').toBeTruthy();

    // DB断言
    const header = await getParameterHeader(ctx.productParamNumber!);
    expect(header.version).toBe(2);
    expect(header.description).toBe('E2E更新后参数');

    const details = await getParameterDetails(ctx.productParamNumber!);
    expect(details.length, '明细应被全量替换为2条').toBe(2);
    expect(details[0].param_value).toBe('55'); // 更新后的值
    expect(details[1].param_name).toBe('硫化温度'); // 新增的行

    console.log('  ✅ 更新草稿+DB断言通过');
  });

  // ==================== 8. 审批流程 ====================

  test('8. 审批流程 - 提交并审批', async () => {
    // 提交审批
    const submitRes = await submitAndApprove('process_parameter_header', ctx.productParamNumber!);

    // DB断言审批状态
    const header = await getParameterHeader(ctx.productParamNumber!);
    expect(header.approval_status, '审批后状态应为已审批').toBe('已审批');

    console.log('  ✅ 审批流程通过');
  });

  // ==================== 9. 已审批不可编辑/删除 ====================

  test('9. 已审批记录不可编辑和删除', async () => {
    // 尝试编辑
    const updateResult = await updateParameterAPI(ctx.productParamId!, {
      item_number: ctx.itemNumber,
      item_name: ctx.itemName,
      version: 3,
      remark: TEST_MARKER,
    });
    expect(updateResult.ok, '已审批记录编辑应被拒绝').toBeFalsy();
    expect(updateResult.status).toBe(400);

    // 尝试删除
    const deleteResult = await deleteParameterAPI(ctx.productParamId!);
    expect(deleteResult.ok, '已审批记录删除应被拒绝').toBeFalsy();
    expect(deleteResult.status).toBe(400);

    console.log('  ✅ 已审批保护逻辑通过');
  });

  // ==================== 10. 反审（已审批→草稿） ====================

  test('10. 反审 - 已审批恢复为草稿', async () => {
    const ctxApi = await getApiContext();
    const res = await ctxApi.post(`${API_BASE}/approval/reverse`, {
      data: { module: 'process_parameter_header', record_id: ctx.productParamNumber, remark: 'E2E反审' },
    });
    expect(res.ok(), '反审应成功').toBeTruthy();

    // DB断言
    const header = await getParameterHeader(ctx.productParamNumber!);
    expect(header.approval_status, '反审后应为草稿').toBe('草稿');

    console.log('  ✅ 反审流程通过');
  });

  // ==================== 11. 删除草稿 ====================

  test('11. 删除草稿参数', async () => {
    const result = await deleteParameterAPI(ctx.productParamId!);
    expect(result.ok, '删除草稿应成功').toBeTruthy();

    // DB断言
    const header = await getParameterHeader(ctx.productParamNumber!);
    expect(header, '主表应已删除').toBeFalsy();

    const details = await getParameterDetails(ctx.productParamNumber!);
    expect(details.length, '明细应级联删除').toBe(0);

    console.log('  ✅ 删除草稿+级联删除通过');
  });

  // ==================== 12. 编号生成规则 ====================

  test('12. 编号生成规则 PP-YYYYMMDD-NNN', async () => {
    // 创建两条，第二条序号应递增
    const r1 = await createParameterAPI({
      item_number: ctx.itemNumber,
      item_name: ctx.itemName,
      remark: TEST_MARKER,
      details: [{ param_name: '测试参数1', param_value: '100' }],
    });
    const r2 = await createParameterAPI({
      item_number: ctx.itemNumber,
      item_name: ctx.itemName,
      remark: TEST_MARKER,
      details: [{ param_name: '测试参数2', param_value: '200' }],
    });

    const pn1 = r1.parameter_number;
    const pn2 = r2.parameter_number;

    expect(pn1).toMatch(/^PP-\d{8}-\d{3}$/);
    expect(pn2).toMatch(/^PP-\d{8}-\d{3}$/);

    // 同一天，序号应递增
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    expect(pn1).toContain(`PP-${today}-`);
    expect(pn2).toContain(`PP-${today}-`);

    const seq1 = parseInt(pn1.split('-')[2], 10);
    const seq2 = parseInt(pn2.split('-')[2], 10);
    expect(seq2, '第二条序号应大于第一条').toBeGreaterThan(seq1);

    console.log(`  编号1: ${pn1}, 编号2: ${pn2}`);
    console.log('  ✅ 编号生成规则验证通过');

    // 清理
    const h1 = await getParameterHeader(pn1);
    const h2 = await getParameterHeader(pn2);
    if (h1) {
      await query(`DELETE FROM process_parameter_detail WHERE parameter_number = @pn`, { pn: { type: T.NVarChar, value: pn1 } });
      await query(`DELETE FROM process_parameter_header WHERE id = @id`, { id: { type: T.Int, value: h1.id } });
    }
    if (h2) {
      await query(`DELETE FROM process_parameter_detail WHERE parameter_number = @pn`, { pn: { type: T.NVarChar, value: pn2 } });
      await query(`DELETE FROM process_parameter_header WHERE id = @id`, { id: { type: T.Int, value: h2.id } });
    }
  });

  // ==================== 13. 优先级逻辑（路线级 > 产品级） ====================

  test('13. 优先级逻辑 - 路线级优先于产品级', async () => {
    if (!ctx.routeNumber) {
      console.log('  ⏭ 无工艺路线，跳过优先级测试');
      return;
    }

    // 创建产品级参数并审批
    const productResult = await createParameterAPI({
      item_number: ctx.itemNumber,
      item_name: ctx.itemName,
      process_route_number: null,
      version: 1,
      description: '优先级测试-产品级',
      remark: TEST_MARKER,
      details: [
        { step_number: 10, step_name: '密炼', param_name: '螺杆转速', param_code: 'SCREW_SPEED', param_value: '40', unit: 'rpm', param_type: '输入', is_required: 'Y' },
      ],
    });
    await submitAndApprove('process_parameter_header', productResult.parameter_number);

    // 创建路线级参数并审批
    const routeResult = await createParameterAPI({
      item_number: ctx.itemNumber,
      item_name: ctx.itemName,
      process_route_number: ctx.routeNumber,
      version: 1,
      description: '优先级测试-路线级',
      remark: TEST_MARKER,
      details: [
        { step_number: 10, step_name: '密炼', param_name: '螺杆转速', param_code: 'SCREW_SPEED', param_value: '55', unit: 'rpm', param_type: '输入', is_required: 'Y' },
      ],
    });
    await submitAndApprove('process_parameter_header', routeResult.parameter_number);

    // by-item 查询 → 应返回产品级参数
    const itemParams = await getParametersByItemAPI(ctx.itemNumber!);
    expect(itemParams.length, '产品级查询应有结果').toBeGreaterThanOrEqual(1);
    const itemScrewSpeed = itemParams.find((p: any) => p.param_code === 'SCREW_SPEED');
    expect(itemScrewSpeed, '应找到SCREW_SPEED参数').toBeTruthy();
    expect(itemScrewSpeed.param_value, '产品级SCREW_SPEED应为40').toBe('40');

    // by-route 查询 → 应返回路线级参数（优先级更高）
    const routeParams = await getParametersByRouteAPI(ctx.itemNumber!, ctx.routeNumber!);
    expect(routeParams.length, '路线级查询应有结果').toBeGreaterThanOrEqual(1);
    const routeScrewSpeed = routeParams.find((p: any) => p.param_code === 'SCREW_SPEED');
    expect(routeScrewSpeed, '应找到SCREW_SPEED参数').toBeTruthy();
    expect(routeScrewSpeed.param_value, '路线级SCREW_SPEED应为55（覆盖产品级40）').toBe('55');

    console.log('  ✅ 优先级逻辑验证通过（路线级55 > 产品级40）');

    // 清理
    const h1 = await getParameterHeader(productResult.parameter_number);
    const h2 = await getParameterHeader(routeResult.parameter_number);
    // 先反审再删
    if (h1) {
      const ctxApi = await getApiContext();
      await ctxApi.post(`${API_BASE}/approval/reverse`, { data: { module: 'process_parameter_header', record_id: productResult.parameter_number, remark: 'E2E清理' } });
      await deleteParameterAPI(h1.id);
    }
    if (h2) {
      const ctxApi = await getApiContext();
      await ctxApi.post(`${API_BASE}/approval/reverse`, { data: { module: 'process_parameter_header', record_id: routeResult.parameter_number, remark: 'E2E清理' } });
      await deleteParameterAPI(h2.id);
    }
  });
});
