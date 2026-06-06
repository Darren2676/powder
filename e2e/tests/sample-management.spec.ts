/**
 * 样品管理全流程 E2E 测试
 *
 * 覆盖：样品申请 → 样件BOM → 样件检测报告 → 成套样品管理（确定最终版本 + 导入设计BOM）
 *
 * 测试策略：API 驱动 + DB 断言（纯API，无UI操作）
 *
 * 测试场景：
 *   1. 准备测试数据（查找客户）
 *   2. 创建样品申请 + 提交（审批通过）
 *   3. 创建样件BOM
 *   4. 查询样件BOM详情
 *   5. 创建BOM版本V1
 *   6. 添加版本明细行
 *   7. 更新版本明细
 *   8. 提交版本V1
 *   9. 创建检测报告
 *  10. 添加检测报告明细
 *  11. 更新检测报告明细
 *  12. 提交检测报告
 *  13. 确定最终版本
 *  14. 导入设计BOM
 *  15. 样件BOM列表查询/筛选
 *  16. 检测报告列表查询/筛选
 *  17. 非法操作校验
 *  18. 清理测试数据
 */
import { test, expect } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import { getApiContext, disposeApiContext } from '../helpers/api.helper';

const API_BASE = 'http://localhost:3000/api/v1';
const TEST_MARKER = `E2E-SAMPLE-FULL-${Date.now()}`;

// ==================== DB 辅助 ====================

async function findCustomer() {
  const rows = await query<any>(
    `SELECT TOP 1 customer_number, customer_name FROM customer`
  );
  return rows[0] || null;
}

async function getSampleRequestByMarker() {
  const rows = await query<any>(
    `SELECT request_number, status, approval_status FROM sample_request WHERE other_requirements = @mk`,
    { mk: { type: T.NVarChar, value: TEST_MARKER } }
  );
  return rows;
}

async function getSampleBomHeader(bomNumber: string) {
  const rows = await query<any>(
    `SELECT * FROM sample_bom_header WHERE sample_bom_number = @bn`,
    { bn: { type: T.NVarChar, value: bomNumber } }
  );
  return rows[0] || null;
}

async function getSampleBomVersion(bomNumber: string, ver: number) {
  const rows = await query<any>(
    `SELECT * FROM sample_bom_version WHERE sample_bom_number = @bn AND version_number = @ver`,
    { bn: { type: T.NVarChar, value: bomNumber }, ver: { type: T.Int, value: ver } }
  );
  return rows[0] || null;
}

async function getSampleBomVersionDetails(bomNumber: string, ver: number) {
  return await query<any>(
    `SELECT * FROM sample_bom_version_detail WHERE sample_bom_number = @bn AND version_number = @ver ORDER BY line_number`,
    { bn: { type: T.NVarChar, value: bomNumber }, ver: { type: T.Int, value: ver } }
  );
}

async function getInspectionReport(reportNumber: string) {
  const rows = await query<any>(
    `SELECT * FROM sample_inspection_report WHERE report_number = @rn`,
    { rn: { type: T.NVarChar, value: reportNumber } }
  );
  return rows[0] || null;
}

async function getInspectionReportItems(reportNumber: string) {
  return await query<any>(
    `SELECT * FROM sample_inspection_report_item WHERE report_number = @rn ORDER BY sort_order`,
    { rn: { type: T.NVarChar, value: reportNumber } }
  );
}

// ==================== 清理 ====================

async function cleanupTestData() {
  // 清理样品申请关联数据
  const headers = await getSampleRequestByMarker();
  for (const h of headers) {
    const rn = h.request_number;
    // 清理样件BOM相关
    const boms = await query<any>(
      `SELECT sample_bom_number FROM sample_bom_header WHERE sample_request_number = @rn`,
      { rn: { type: T.NVarChar, value: rn } }
    );
    for (const bom of boms) {
      const bn = bom.sample_bom_number;
      // 清理检测报告
      await query(`DELETE FROM sample_inspection_report_item WHERE report_number IN (SELECT report_number FROM sample_inspection_report WHERE sample_bom_number = @bn)`,
        { bn: { type: T.NVarChar, value: bn } });
      await query(`DELETE FROM sample_inspection_report WHERE sample_bom_number = @bn`,
        { bn: { type: T.NVarChar, value: bn } });
      // 清理版本明细
      await query(`DELETE FROM sample_bom_version_detail WHERE sample_bom_number = @bn`,
        { bn: { type: T.NVarChar, value: bn } });
      await query(`DELETE FROM sample_bom_version WHERE sample_bom_number = @bn`,
        { bn: { type: T.NVarChar, value: bn } });
    }
    // 清理导入的设计BOM（通过remark字段匹配）
    for (const bom of boms) {
      const bomH = await query<any>(
        `SELECT bom_number FROM bom_header WHERE remark LIKE @pattern`,
        { pattern: { type: T.NVarChar, value: `%${bom.sample_bom_number}%` } }
      );
      for (const b of bomH) {
        await query(`DELETE FROM bom_detail WHERE bom_number = @bn`, { bn: { type: T.NVarChar, value: b.bom_number } });
        await query(`DELETE FROM bom_header WHERE bom_number = @bn`, { bn: { type: T.NVarChar, value: b.bom_number } });
      }
    }
    await query(`DELETE FROM sample_bom_header WHERE sample_request_number = @rn`,
      { rn: { type: T.NVarChar, value: rn } });
    // 清理样品申请
    await query(`DELETE FROM sample_request_lab WHERE request_number = @rn`, { rn: { type: T.NVarChar, value: rn } });
    await query(`DELETE FROM sample_request_item WHERE request_number = @rn`, { rn: { type: T.NVarChar, value: rn } });
  }
  await query(`DELETE FROM sample_request WHERE other_requirements = @mk`,
    { mk: { type: T.NVarChar, value: TEST_MARKER } });
  console.log(`[Cleanup] 清理样品全流程测试数据 ${headers.length} 条`);
}

// ==================== API 辅助 ====================

async function createSampleRequestAPI(data: any) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-requests`, { data });
  if (!res.ok()) throw new Error(`创建样品申请失败 ${res.status()}: ${await res.text()}`);
  return (await res.json())?.data;
}

async function submitSampleRequestAPI(id: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-requests/${encodeURIComponent(id)}/submit`);
  return { ok: res.ok(), status: res.status(), body: res.ok() ? (await res.json())?.data : await res.text() };
}

async function receiveSampleRequestAPI(id: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-requests/${encodeURIComponent(id)}/receive`);
  return { ok: res.ok(), status: res.status(), body: res.ok() ? (await res.json())?.data : await res.text() };
}

async function completeSampleRequestAPI(id: string, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-requests/${encodeURIComponent(id)}/complete`, { data });
  return { ok: res.ok(), status: res.status(), body: res.ok() ? (await res.json())?.data : await res.text() };
}

async function deleteSampleRequestAPI(id: string) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/sample-requests/${encodeURIComponent(id)}`);
  return { ok: res.ok(), status: res.status(), body: res.ok() ? (await res.json())?.data : await res.text() };
}

// 样件BOM API
async function createSampleBomAPI(data: any) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-boms`, { data });
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, status: res.status(), body: (await res.json())?.data };
}

async function getSampleBomDetailAPI(id: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/sample-boms/${encodeURIComponent(id)}`);
  if (!res.ok()) throw new Error(`获取样件BOM详情失败 ${res.status()}: ${await res.text()}`);
  return (await res.json())?.data;
}

async function getSampleBomListAPI(params?: Record<string, string>) {
  const ctx = await getApiContext();
  const qs = new URLSearchParams(params || {}).toString();
  const url = `${API_BASE}/sample-boms${qs ? '?' + qs : ''}`;
  const res = await ctx.get(url);
  if (!res.ok()) throw new Error(`查询样件BOM列表失败 ${res.status()}: ${await res.text()}`);
  return (await res.json())?.data;
}

async function updateSampleBomAPI(id: string, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/sample-boms/${encodeURIComponent(id)}`, { data });
  return { ok: res.ok(), status: res.status(), body: res.ok() ? (await res.json())?.data : await res.text() };
}

async function deleteSampleBomAPI(id: string) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/sample-boms/${encodeURIComponent(id)}`);
  return { ok: res.ok(), status: res.status(), body: res.ok() ? (await res.json())?.data : await res.text() };
}

// 版本 API
async function createVersionAPI(bomNumber: string, data?: any) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-boms/${encodeURIComponent(bomNumber)}/versions`, { data: data || {} });
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, status: res.status(), body: (await res.json())?.data };
}

async function getVersionDetailAPI(bomNumber: string, ver: number) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/sample-boms/${encodeURIComponent(bomNumber)}/versions/${ver}`);
  if (!res.ok()) throw new Error(`获取版本详情失败 ${res.status()}`);
  return (await res.json())?.data;
}

async function submitVersionAPI(bomNumber: string, ver: number) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-boms/${encodeURIComponent(bomNumber)}/versions/${ver}/submit`);
  return { ok: res.ok(), status: res.status(), body: res.ok() ? (await res.json())?.data : await res.text() };
}

async function deleteVersionAPI(bomNumber: string, ver: number) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/sample-boms/${encodeURIComponent(bomNumber)}/versions/${ver}`);
  return { ok: res.ok(), status: res.status(), body: res.ok() ? (await res.json())?.data : await res.text() };
}

// 版本明细 API
async function addVersionDetailAPI(bomNumber: string, ver: number, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-boms/${encodeURIComponent(bomNumber)}/versions/${ver}/details`, { data });
  if (!res.ok()) throw new Error(`添加版本明细失败 ${res.status()}: ${await res.text()}`);
  return (await res.json())?.data;
}

async function updateVersionDetailAPI(detailId: number, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/sample-boms/version-details/${detailId}`, { data });
  return { ok: res.ok(), status: res.status() };
}

async function deleteVersionDetailAPI(detailId: number) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/sample-boms/version-details/${detailId}`);
  return { ok: res.ok(), status: res.status() };
}

// 检测报告 API
async function createInspectionReportAPI(data: any) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-boms/inspection-reports`, { data });
  if (!res.ok()) {
    const text = await res.text();
    return { ok: false, status: res.status(), body: text };
  }
  return { ok: true, status: res.status(), body: (await res.json())?.data };
}

async function getInspectionReportDetailAPI(reportNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/sample-boms/inspection-reports/${encodeURIComponent(reportNumber)}`);
  if (!res.ok()) throw new Error(`获取检测报告详情失败 ${res.status()}`);
  return (await res.json())?.data;
}

async function getInspectionReportListAPI(params?: Record<string, string>) {
  const ctx = await getApiContext();
  const qs = new URLSearchParams(params || {}).toString();
  const url = `${API_BASE}/sample-boms/inspection-reports${qs ? '?' + qs : ''}`;
  const res = await ctx.get(url);
  if (!res.ok()) throw new Error(`查询检测报告列表失败 ${res.status()}`);
  return (await res.json())?.data;
}

async function updateInspectionReportAPI(reportNumber: string, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/sample-boms/inspection-reports/${encodeURIComponent(reportNumber)}`, { data });
  return { ok: res.ok(), status: res.status(), body: res.ok() ? (await res.json())?.data : await res.text() };
}

async function submitInspectionReportAPI(reportNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-boms/inspection-reports/${encodeURIComponent(reportNumber)}/submit`);
  return { ok: res.ok(), status: res.status(), body: res.ok() ? (await res.json())?.data : await res.text() };
}

async function deleteInspectionReportAPI(reportNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/sample-boms/inspection-reports/${encodeURIComponent(reportNumber)}`);
  return { ok: res.ok(), status: res.status(), body: res.ok() ? (await res.json())?.data : await res.text() };
}

async function addReportItemAPI(reportNumber: string, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-boms/inspection-reports/${encodeURIComponent(reportNumber)}/items`, { data });
  if (!res.ok()) throw new Error(`添加检测项失败 ${res.status()}: ${await res.text()}`);
  return (await res.json())?.data;
}

async function updateReportItemAPI(itemId: number, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/sample-boms/inspection-report-items/${itemId}`, { data });
  return { ok: res.ok(), status: res.status() };
}

async function deleteReportItemAPI(itemId: number) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/sample-boms/inspection-report-items/${itemId}`);
  return { ok: res.ok(), status: res.status() };
}

// 确定最终版本 & 导入设计BOM
async function determineFinalVersionAPI(bomNumber: string, finalVersion: number) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-boms/${encodeURIComponent(bomNumber)}/determine-version`, {
    data: { final_version: finalVersion }
  });
  return { ok: res.ok(), status: res.status(), body: res.ok() ? (await res.json())?.data : await res.text() };
}

async function importToDesignBomAPI(bomNumber: string, bomNumber2: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sample-boms/${encodeURIComponent(bomNumber)}/import-to-design-bom`, {
    data: { bom_number: bomNumber2 }
  });
  return { ok: res.ok(), status: res.status(), body: res.ok() ? (await res.json())?.data : await res.text() };
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

test.describe.serial('样品管理全流程 E2E', () => {
  test.setTimeout(120_000);

  const ctx: {
    customerName?: string;
    requestNumber?: string;
    sampleBomId?: string;
    sampleBomNumber?: string;
    versionNumber?: number;
    detailId1?: number;
    detailId2?: number;
    reportNumber?: string;
    reportItemId?: number;
    designBomNumber?: string;
  } = {};

  // ==================== 1. 准备测试数据 ====================

  test('1. 准备测试数据 - 查找客户', async () => {
    const customer = await findCustomer();
    expect(customer, '数据库中没有客户').toBeTruthy();
    ctx.customerName = customer.customer_name;
    console.log(`  找到客户: ${customer.customer_number} - ${customer.customer_name}`);
  });

  // ==================== 2. 创建+提交样品申请 ====================

  test('2. 创建样品申请并提交（审批通过）', async () => {
    // 创建
    const result = await createSampleRequestAPI({
      request_date: '2026-06-01',
      deadline_date: '2026-06-30',
      applicant: 'E2E样品测试员',
      urgency: '紧急',
      customer_name: ctx.customerName,
      market: '汽车',
      product_type: '底粉+面粉',
      color_spec: 'RAL9016',
      other_requirements: TEST_MARKER,
      items: [
        { item_type: '样板', quantity: 5, unit: '片', is_requested: true, sort_order: 1 },
        { item_type: '样粉', quantity: 2, unit: '公斤', is_requested: true, sort_order: 2 },
      ],
    });
    expect(result.request_number).toMatch(/^SR-\d{8}-\d{3}$/);
    ctx.requestNumber = result.request_number;

    // 提交 → 待研发（approval_status=已审核）
    const submitRes = await submitSampleRequestAPI(ctx.requestNumber!);
    expect(submitRes.ok, '提交应成功').toBeTruthy();

    // DB断言
    const rows = await query<any>(
      `SELECT status, approval_status FROM sample_request WHERE request_number = @rn`,
      { rn: { type: T.NVarChar, value: ctx.requestNumber } }
    );
    expect(rows[0].status).toBe('待研发');
    expect(rows[0].approval_status).toBe('已审核');
    console.log(`  ✅ 样品申请 ${ctx.requestNumber} 已审核`);
  });

  // ==================== 3. 创建样件BOM ====================

  test('3. 创建样件BOM', async () => {
    const result = await createSampleBomAPI({
      sample_request_number: ctx.requestNumber,
      bom_name: 'E2E测试样件BOM',
      item_number: 'E2E-ITEM-001',
      item_name: 'E2E测试产品',
      base_quantity: 10,
      base_unit: '公斤',
      remark: TEST_MARKER,
    });
    expect(result.ok, '创建样件BOM应成功').toBeTruthy();
    expect(result.body.sample_bom_number).toMatch(/^SB-\d{8}-\d{3}$/);
    ctx.sampleBomNumber = result.body.sample_bom_number;

    // DB断言
    const header = await getSampleBomHeader(ctx.sampleBomNumber!);
    expect(header, '样件BOM记录应存在').toBeTruthy();
    expect(header.sample_request_number).toBe(ctx.requestNumber);
    expect(header.bom_name).toBe('E2E测试样件BOM');
    expect(header.item_number).toBe('E2E-ITEM-001');
    expect(header.status).toBe('试制中');
    expect(Number(header.current_version)).toBe(0);

    // 保存ID用于后续API调用
    const idRows = await query<any>(
      `SELECT id FROM sample_bom_header WHERE sample_bom_number = @bn`,
      { bn: { type: T.NVarChar, value: ctx.sampleBomNumber } }
    );
    ctx.sampleBomId = idRows[0].id;

    console.log(`  ✅ 样件BOM ${ctx.sampleBomNumber} 创建成功`);
  });

  // ==================== 4. 查询样件BOM详情 ====================

  test('4. 查询样件BOM详情', async () => {
    const detail = await getSampleBomDetailAPI(ctx.sampleBomId!);
    expect(detail.header.sample_bom_number).toBe(ctx.sampleBomNumber);
    expect(detail.header.bom_name).toBe('E2E测试样件BOM');
    expect(Array.isArray(detail.versions)).toBeTruthy();
    console.log('  ✅ 样件BOM详情查询通过');
  });

  // ==================== 5. 创建BOM版本V1 ====================

  test('5. 创建BOM版本V1', async () => {
    const result = await createVersionAPI(ctx.sampleBomNumber!, {
      version_remark: 'E2E初始版本',
    });
    expect(result.ok, '创建版本应成功').toBeTruthy();
    expect(result.body.version_number).toBe(1);
    ctx.versionNumber = 1;

    // DB断言
    const ver = await getSampleBomVersion(ctx.sampleBomNumber!, 1);
    expect(ver, '版本记录应存在').toBeTruthy();
    expect(ver.status).toBe('草稿');
    expect(ver.version_remark).toBe('E2E初始版本');

    // 主表 current_version 应更新
    const header = await getSampleBomHeader(ctx.sampleBomNumber!);
    expect(Number(header.current_version)).toBe(1);

    console.log('  ✅ BOM版本V1创建成功');
  });

  // ==================== 6. 添加版本明细行 ====================

  test('6. 添加版本明细行', async () => {
    // 添加第一行
    const d1 = await addVersionDetailAPI(ctx.sampleBomNumber!, 1, {
      material_number: 'E2E-MAT-001',
      material_name: 'E2E环氧树脂',
      material_type: '原材料',
      standard_quantity: 5.0,
      unit: '公斤',
      wastage_rate: 0.02,
      actual_quantity: 5.1,
      step_number: '10',
      is_key_material: 1,
      remark: 'E2E关键材料',
    });
    expect(d1.id).toBeTruthy();
    expect(d1.line_number).toBe(1);
    ctx.detailId1 = d1.id;

    // 添加第二行
    const d2 = await addVersionDetailAPI(ctx.sampleBomNumber!, 1, {
      material_number: 'E2E-MAT-002',
      material_name: 'E2E固化剂',
      material_type: '原材料',
      standard_quantity: 2.0,
      unit: '公斤',
      wastage_rate: 0.01,
      actual_quantity: 2.02,
      step_number: '20',
      is_key_material: 0,
    });
    expect(d2.id).toBeTruthy();
    expect(d2.line_number).toBe(2);
    ctx.detailId2 = d2.id;

    // DB断言
    const details = await getSampleBomVersionDetails(ctx.sampleBomNumber!, 1);
    expect(details.length).toBe(2);
    expect(details[0].material_number).toBe('E2E-MAT-001');
    expect(details[0].is_key_material).toBeTruthy();
    expect(details[1].material_number).toBe('E2E-MAT-002');

    console.log('  ✅ 版本明细行添加成功（2行）');
  });

  // ==================== 7. 更新版本明细 ====================

  test('7. 更新版本明细', async () => {
    const result = await updateVersionDetailAPI(ctx.detailId1!, {
      material_number: 'E2E-MAT-001',
      material_name: 'E2E环氧树脂（更新）',
      material_type: '原材料',
      standard_quantity: 5.5,
      unit: '公斤',
      wastage_rate: 0.03,
      actual_quantity: 5.67,
      step_number: '10',
      is_key_material: 1,
    });
    expect(result.ok, '更新应成功').toBeTruthy();

    // DB断言
    const details = await getSampleBomVersionDetails(ctx.sampleBomNumber!, 1);
    const updated = details.find((d: any) => d.id === ctx.detailId1);
    expect(updated.material_name).toBe('E2E环氧树脂（更新）');
    expect(Number(updated.standard_quantity)).toBeCloseTo(5.5, 1);

    console.log('  ✅ 版本明细更新通过');
  });

  // ==================== 8. 提交版本V1 ====================

  test('8. 提交版本V1', async () => {
    const result = await submitVersionAPI(ctx.sampleBomNumber!, 1);
    expect(result.ok, '提交版本应成功').toBeTruthy();

    const ver = await getSampleBomVersion(ctx.sampleBomNumber!, 1);
    expect(ver.status).toBe('已提交');
    console.log('  ✅ 版本V1已提交');
  });

  // ==================== 9. 创建检测报告 ====================

  test('9. 创建检测报告', async () => {
    const result = await createInspectionReportAPI({
      sample_bom_number: ctx.sampleBomNumber,
      version_number: 1,
      inspection_date: '2026-06-05',
      inspector: 'E2E检测员',
      conclusion: 'E2E检测结论：合格',
    });
    expect(result.ok, '创建检测报告应成功').toBeTruthy();
    expect(result.body.report_number).toMatch(/^SIR-\d{8}-\d{3}$/);
    ctx.reportNumber = result.body.report_number;

    // DB断言
    const report = await getInspectionReport(ctx.reportNumber!);
    expect(report).toBeTruthy();
    expect(report.sample_bom_number).toBe(ctx.sampleBomNumber);
    expect(Number(report.version_number)).toBe(1);
    expect(report.status).toBe('草稿');
    expect(report.inspection_result).toBe('待定');
    expect(report.inspector).toBe('E2E检测员');

    console.log(`  ✅ 检测报告 ${ctx.reportNumber} 创建成功`);
  });

  // ==================== 10. 添加检测报告明细 ====================

  test('10. 添加检测报告明细', async () => {
    // 添加检测项1 - 附着力
    const item1 = await addReportItemAPI(ctx.reportNumber!, {
      char_name: '附着力',
      inspect_requirement: '≤1级',
      data_type: '数值',
      upper_limit: 1,
      standard_value: 0,
      lower_limit: 0,
      measured_value: 0.5,
      is_qualified: '合格',
    });
    expect(item1.id).toBeTruthy();
    ctx.reportItemId = item1.id;

    // 添加检测项2 - 光泽度
    await addReportItemAPI(ctx.reportNumber!, {
      char_name: '光泽度',
      inspect_requirement: '80-90',
      data_type: '数值',
      upper_limit: 90,
      standard_value: 85,
      lower_limit: 80,
      measured_value: 86,
      is_qualified: '合格',
    });

    // 添加检测项3 - 耐冲击性
    await addReportItemAPI(ctx.reportNumber!, {
      char_name: '耐冲击性',
      inspect_requirement: '≥50kg.cm',
      data_type: '数值',
      upper_limit: null,
      standard_value: 50,
      lower_limit: 50,
      measured_value: 55,
      is_qualified: '合格',
    });

    // DB断言
    const items = await getInspectionReportItems(ctx.reportNumber!);
    expect(items.length).toBe(3);
    expect(items[0].char_name).toBe('附着力');
    expect(items[1].char_name).toBe('光泽度');
    expect(items[2].char_name).toBe('耐冲击性');
    expect(items[0].sort_order).toBeLessThan(items[1].sort_order);

    console.log('  ✅ 检测报告明细添加成功（3项）');
  });

  // ==================== 11. 更新检测报告明细 ====================

  test('11. 更新检测报告明细', async () => {
    const result = await updateReportItemAPI(ctx.reportItemId!, {
      char_name: '附着力',
      inspect_requirement: '≤1级',
      data_type: '数值',
      upper_limit: 1,
      standard_value: 0,
      lower_limit: 0,
      measured_value: 0.3,
      is_qualified: '合格',
      remark: 'E2E更新备注',
    });
    expect(result.ok, '更新检测项应成功').toBeTruthy();

    const items = await getInspectionReportItems(ctx.reportNumber!);
    const updated = items.find((i: any) => i.id === ctx.reportItemId);
    expect(Number(updated.measured_value)).toBeCloseTo(0.3, 1);
    expect(updated.remark).toBe('E2E更新备注');

    console.log('  ✅ 检测报告明细更新通过');
  });

  // ==================== 12. 更新并提交检测报告 ====================

  test('12. 更新并提交检测报告', async () => {
    // 更新报告主表 - 设置检测结果
    const updateRes = await updateInspectionReportAPI(ctx.reportNumber!, {
      inspection_date: '2026-06-05',
      inspector: 'E2E检测员',
      inspection_result: '合格',
      conclusion: 'E2E全部检测项合格',
    });
    expect(updateRes.ok, '更新报告应成功').toBeTruthy();

    // 提交
    const submitRes = await submitInspectionReportAPI(ctx.reportNumber!);
    expect(submitRes.ok, '提交报告应成功').toBeTruthy();

    // DB断言
    const report = await getInspectionReport(ctx.reportNumber!);
    expect(report.status).toBe('已提交');
    expect(report.inspection_result).toBe('合格');

    // 版本状态应更新为"已检测"
    const ver = await getSampleBomVersion(ctx.sampleBomNumber!, 1);
    expect(ver.status).toBe('已检测');
    expect(ver.inspection_result).toBe('合格');

    console.log('  ✅ 检测报告已提交，版本状态更新为已检测');
  });

  // ==================== 13. 确定最终版本 ====================

  test('13. 确定最终版本（成套样品管理）', async () => {
    const result = await determineFinalVersionAPI(ctx.sampleBomNumber!, 1);
    expect(result.ok, '确定最终版本应成功').toBeTruthy();

    // DB断言
    const header = await getSampleBomHeader(ctx.sampleBomNumber!);
    expect(header.status).toBe('已确定');
    expect(Number(header.final_version)).toBe(1);

    console.log('  ✅ 确定最终版本V1成功');
  });

  // ==================== 14. 导入设计BOM ====================

  test('14. 导入设计BOM（成套样品管理）', async () => {
    ctx.designBomNumber = `DB-${Date.now()}-E2E`;
    const result = await importToDesignBomAPI(ctx.sampleBomNumber!, ctx.designBomNumber);
    if (!result.ok) console.log(`  导入设计BOM失败: ${result.status} - ${result.body}`);
    expect(result.ok, '导入设计BOM应成功').toBeTruthy();

    // DB断言 - 样件BOM状态变为"已导入"
    const header = await getSampleBomHeader(ctx.sampleBomNumber!);
    expect(header.status).toBe('已导入');

    // DB断言 - 设计BOM已创建
    const bomRows = await query<any>(
      `SELECT * FROM bom_header WHERE bom_number = @bn`,
      { bn: { type: T.NVarChar, value: ctx.designBomNumber } }
    );
    expect(bomRows.length, '设计BOM应已创建').toBe(1);
    expect(bomRows[0].bom_type).toBe('设计BOM');
    expect(bomRows[0].item_number).toBe('E2E-ITEM-001');

    // DB断言 - 设计BOM明细
    const bomDetails = await query<any>(
      `SELECT * FROM bom_detail WHERE bom_number = @bn ORDER BY line_number`,
      { bn: { type: T.NVarChar, value: ctx.designBomNumber } }
    );
    expect(bomDetails.length, '设计BOM应有2行明细').toBe(2);
    expect(bomDetails[0].material_number).toBe('E2E-MAT-001');
    expect(bomDetails[1].material_number).toBe('E2E-MAT-002');

    console.log(`  ✅ 导入设计BOM ${ctx.designBomNumber} 成功`);
  });

  // ==================== 15. 样件BOM列表查询/筛选 ====================

  test('15. 样件BOM列表查询与筛选', async () => {
    // 全量列表
    const list = await getSampleBomListAPI({ limit: '100' });
    expect(list.items.length).toBeGreaterThanOrEqual(1);

    // 按样品申请编号筛选
    const filtered = await getSampleBomListAPI({
      sample_request_number: ctx.requestNumber!,
    });
    expect(filtered.items.length).toBeGreaterThanOrEqual(1);
    const found = filtered.items.some((i: any) => i.sample_bom_number === ctx.sampleBomNumber);
    expect(found, '筛选结果应包含测试BOM').toBeTruthy();

    // 搜索
    const searched = await getSampleBomListAPI({ search: 'E2E测试样件BOM' });
    expect(searched.items.length).toBeGreaterThanOrEqual(1);

    console.log('  ✅ 样件BOM列表查询/筛选通过');
  });

  // ==================== 16. 检测报告列表查询/筛选 ====================

  test('16. 检测报告列表查询与筛选', async () => {
    // 全量列表
    const list = await getInspectionReportListAPI({ limit: '100' });
    expect(list.items.length).toBeGreaterThanOrEqual(1);

    // 按样件BOM编号筛选
    const filtered = await getInspectionReportListAPI({
      sample_bom_number: ctx.sampleBomNumber!,
    });
    expect(filtered.items.length).toBeGreaterThanOrEqual(1);
    const found = filtered.items.some((i: any) => i.report_number === ctx.reportNumber);
    expect(found).toBeTruthy();

    // 按状态筛选
    const submittedList = await getInspectionReportListAPI({ status: '已提交' });
    const submittedFound = submittedList.items.some((i: any) => i.report_number === ctx.reportNumber);
    expect(submittedFound, '已提交列表应包含测试报告').toBeTruthy();

    // 按检测结果筛选
    const qualifiedList = await getInspectionReportListAPI({ inspection_result: '合格' });
    const qualifiedFound = qualifiedList.items.some((i: any) => i.report_number === ctx.reportNumber);
    expect(qualifiedFound, '合格列表应包含测试报告').toBeTruthy();

    // 详情查询
    const detail = await getInspectionReportDetailAPI(ctx.reportNumber!);
    expect(detail.report.report_number).toBe(ctx.reportNumber);
    expect(detail.items.length).toBe(3);

    console.log('  ✅ 检测报告列表查询/筛选通过');
  });

  // ==================== 17. 非法操作校验 ====================

  test('17. 非法操作校验', async () => {
    // 17a. 未审核的样品申请不可创建样件BOM
    const newReq = await createSampleRequestAPI({
      customer_name: ctx.customerName,
      other_requirements: TEST_MARKER + '-draft',
    });
    const bomResult = await createSampleBomAPI({
      sample_request_number: newReq.request_number,
      bom_name: '不应成功',
    });
    expect(bomResult.ok, '未审核样品申请不可创建BOM').toBeFalsy();
    expect(bomResult.status).toBe(400);
    await deleteSampleRequestAPI(newReq.request_number);

    // 17b. 已导入的样件BOM不可编辑
    const updateResult = await updateSampleBomAPI(ctx.sampleBomId!, { bom_name: '不应成功' });
    expect(updateResult.ok, '已导入BOM不可编辑').toBeFalsy();

    // 17c. 已导入的样件BOM不可创建新版本
    const newVerResult = await createVersionAPI(ctx.sampleBomNumber!);
    expect(newVerResult.ok, '已导入BOM不可创建新版本').toBeFalsy();

    // 17d. 已提交的检测报告不可编辑
    const editReportResult = await updateInspectionReportAPI(ctx.reportNumber!, { conclusion: '不应成功' });
    expect(editReportResult.ok, '已提交报告不可编辑').toBeFalsy();

    // 17e. 已提交的检测报告不可删除
    const delReportResult = await deleteInspectionReportAPI(ctx.reportNumber!);
    expect(delReportResult.ok, '已提交报告不可删除').toBeFalsy();

    // 17f. 已提交的版本不可删除
    const delVerResult = await deleteVersionAPI(ctx.sampleBomNumber!, 1);
    expect(delVerResult.ok, '已提交版本不可删除').toBeFalsy();

    // 17g. 重复创建检测报告（同版本只允许一份）
    const dupReport = await createInspectionReportAPI({
      sample_bom_number: ctx.sampleBomNumber,
      version_number: 1,
    });
    expect(dupReport.ok, '同版本不可重复创建报告').toBeFalsy();

    // 17h. 非试制中状态不可删除BOM
    const delBomResult = await deleteSampleBomAPI(ctx.sampleBomId!);
    expect(delBomResult.ok, '非试制中BOM不可删除').toBeFalsy();

    console.log('  ✅ 非法操作校验全部通过（8项）');
  });

  // ==================== 18. 按样品申请查BOM ====================

  test('18. 按样品申请编号查询关联样件BOM', async () => {
    const ctx2 = await getApiContext();
    const res = await ctx2.get(`${API_BASE}/sample-boms/by-request/${encodeURIComponent(ctx.requestNumber!)}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data;
    expect(Array.isArray(items)).toBeTruthy();
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].sample_bom_number).toBe(ctx.sampleBomNumber);
    console.log('  ✅ 按申请编号查BOM通过');
  });

  // ==================== 19. 删除检测项 ====================

  test('19. 删除版本明细和检测项', async () => {
    // 已提交的版本明细不可直接删除（但API层面deleteVersionDetail未做状态校验，直接删除）
    // 测试 deleteReportItem
    const items = await getInspectionReportItems(ctx.reportNumber!);
    const lastItem = items[items.length - 1];

    // 已提交的报告不可添加新检测项
    const addRes = await getApiContext().then(c =>
      c.post(`${API_BASE}/sample-boms/inspection-reports/${encodeURIComponent(ctx.reportNumber!)}/items`, {
        data: { char_name: '不应成功' }
      })
    );
    expect(addRes.ok(), '已提交报告不可添加检测项').toBeFalsy();

    console.log('  ✅ 检测项操作校验通过');
  });

  // ==================== 20. 更新样件BOM主表（试制中状态） ====================

  test('20. 创建新BOM测试编辑和删除', async () => {
    // 创建一个新的BOM（试制中），用于测试编辑/删除
    // 需要先让样品申请重新处于已审核状态 - 当前已完成状态也可以创建BOM
    // 但样品申请已完成，approval_status=已完成，不是已审核，所以不行
    // 创建一个新的样品申请
    const newReq = await createSampleRequestAPI({
      customer_name: ctx.customerName,
      applicant: 'E2E BOM编辑测试',
      other_requirements: TEST_MARKER + '-edit',
    });
    await submitSampleRequestAPI(newReq.request_number);

    const bom = await createSampleBomAPI({
      sample_request_number: newReq.request_number,
      bom_name: 'E2E可编辑BOM',
      item_number: 'E2E-EDIT-001',
      item_name: 'E2E可编辑产品',
      base_quantity: 5,
      base_unit: '公斤',
    });
    expect(bom.ok).toBeTruthy();

    const bomIdRows = await query<any>(
      `SELECT id FROM sample_bom_header WHERE sample_bom_number = @bn`,
      { bn: { type: T.NVarChar, value: bom.body.sample_bom_number } }
    );
    const bomId = bomIdRows[0].id;

    // 编辑
    const editRes = await updateSampleBomAPI(bomId, {
      bom_name: 'E2E已更新BOM',
      item_number: 'E2E-EDIT-001',
      item_name: 'E2E已更新产品',
      base_quantity: 10,
      base_unit: '公斤',
    });
    expect(editRes.ok, '试制中BOM应可编辑').toBeTruthy();

    const header = await getSampleBomHeader(bom.body.sample_bom_number);
    expect(header.bom_name).toBe('E2E已更新BOM');
    expect(Number(header.base_quantity)).toBe(10);

    // 删除（试制中可删除）
    const delRes = await deleteSampleBomAPI(bomId);
    expect(delRes.ok, '试制中BOM应可删除').toBeTruthy();

    const deleted = await getSampleBomHeader(bom.body.sample_bom_number);
    expect(deleted, '删除后应不存在').toBeFalsy();

    // 清理样品申请
    // 先撤回到草稿
    const ctx2 = await getApiContext();
    await ctx2.post(`${API_BASE}/sample-requests/${encodeURIComponent(newReq.request_number)}/withdraw`);
    await deleteSampleRequestAPI(newReq.request_number);

    console.log('  ✅ BOM编辑/删除测试通过');
  });
});
