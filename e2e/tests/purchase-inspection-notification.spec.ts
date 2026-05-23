/**
 * 来料检验通知 E2E 测试
 * 场景：采购订单 PUR-20260517-003 入库到待检仓
 * 验证：来料检验通知记录存在（DB + API）
 */
import { test, expect } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import { getApiContext, disposeApiContext } from '../helpers/api.helper';

const PO_NUMBER = 'PUR-20260517-003';
const API_BASE = 'http://localhost:3000/api/v1';

test.describe.serial('来料检验通知 - PUR-20260517-003 入库验证', () => {
  test.setTimeout(120_000);

  let apiCtx: any;
  let stockInNumber: string | undefined;
  let inspectionNumber: string | undefined;
  let inspItemNumber: string | undefined;

  test.beforeAll(async () => {
    apiCtx = await getApiContext();
  });

  test.afterAll(async () => {
    await disposeApiContext();
  });

  test('1. 检查采购订单状态', async () => {
    const rows = await query<any>(
      `SELECT purchase_order_number, approval_status, order_status FROM purchase_order WHERE purchase_order_number = @pon`,
      { pon: { type: T.NVarChar, value: PO_NUMBER } }
    );
    console.log(`[PO] ${rows.length} 条, approval=${rows[0]?.approval_status}, order=${rows[0]?.order_status}`);
    expect(rows.length).toBeGreaterThan(0);
  });

  test('2. 获取可入库明细并执行入库', async () => {
    const res = await apiCtx.get(`${API_BASE}/purchase-orders/${encodeURIComponent(PO_NUMBER)}/receivable`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    console.log(`[可入库] 明细数: ${items.length}`);

    if (items.length === 0) {
      console.log('[SKIP] 无可入库明细');
      test.skip();
      return;
    }

    const inspItem = items.find((i: any) => i.incoming_inspection === 'Y');
    if (!inspItem) {
      console.log('[SKIP] 没有需检验物料');
      test.skip();
      return;
    }

    inspItemNumber = inspItem.item_number;
    console.log(`[检验物料] ${inspItem.item_number} ${inspItem.item_name}, remaining=${inspItem.remaining}`);

    const whRows = await query<any>(
      `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_name = N'待检仓' OR warehouse_type = N'待检仓'`
    );
    const inspWh = whRows.length > 0 ? whRows[0].warehouse_number : '09';
    const inspWhName = whRows.length > 0 ? whRows[0].warehouse_name : '待检仓';

    const stockInQty = parseFloat(inspItem.remaining) || 0;
    const createRes = await apiCtx.post(`${API_BASE}/stock-ins`, {
      data: {
        purchase_order_number: PO_NUMBER,
        warehouse_number: inspWh,
        warehouse_name: inspWhName,
        details: [{
          purchase_detail_id: inspItem.id,
          item_number: inspItem.item_number,
          item_name: inspItem.item_name,
          specifications: inspItem.specifications || '',
          basic_unit: inspItem.basic_unit || '',
          order_quantity: inspItem.order_quantity,
          received_quantity: inspItem.received_quantity,
          stock_in_quantity: stockInQty,
          qualified_quantity: 0,
          unqualified_quantity: 0,
        }],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const createBody = await createRes.json();
    stockInNumber = createBody?.data?.stock_in_number;
    const autoInspections = createBody?.data?.auto_inspections || [];
    console.log(`[入库单] ${stockInNumber}, auto_inspections=${JSON.stringify(autoInspections)}`);

    if (autoInspections.length > 0) {
      inspectionNumber = autoInspections[0];
    }

    const confirmRes = await apiCtx.post(`${API_BASE}/stock-ins/${encodeURIComponent(stockInNumber!)}/confirm`);
    expect(confirmRes.ok()).toBeTruthy();
    console.log('[入库] 确认成功');

    await new Promise(r => setTimeout(r, 1500));
  });

  test('3. 验证入库明细状态', async () => {
    if (!stockInNumber || !inspItemNumber) { test.skip(); return; }

    const rows = await query<any>(
      `SELECT qualified_quantity, inspect_status, inspection_number FROM stock_in_detail WHERE stock_in_number = @si AND item_number = @item`,
      { si: { type: T.NVarChar, value: stockInNumber }, item: { type: T.NVarChar, value: inspItemNumber } }
    );
    expect(rows.length).toBeGreaterThan(0);
    console.log(`[入库明细] qualified=${rows[0].qualified_quantity}, status=${rows[0].inspect_status}, insp=${rows[0].inspection_number}`);
    expect(parseFloat(rows[0].qualified_quantity) || 0).toBe(0);
    expect(rows[0].inspect_status?.trim()).toBe('待检验');
    if (!inspectionNumber) inspectionNumber = rows[0].inspection_number;
  });

  test('4. 验证来料检验通知DB记录', async () => {
    if (!stockInNumber || !inspItemNumber) { test.skip(); return; }

    const rows = await query<any>(
      `SELECT inspection_number, inspect_status, inspect_plan_name, inspect_method, sampling_method, sample_quantity, defect_categories
       FROM purchase_quality_inspection WHERE stock_in_number = @si AND item_number = @item`,
      { si: { type: T.NVarChar, value: stockInNumber }, item: { type: T.NVarChar, value: inspItemNumber } }
    );
    expect(rows.length).toBeGreaterThan(0);
    const r = rows[0];
    console.log(`[检验单DB] number=${r.inspection_number}, status=${r.inspect_status}, plan=${r.inspect_plan_name}, method=${r.inspect_method}, sampling=${r.sampling_method}, sample_qty=${r.sample_quantity}, defects=${r.defect_categories}`);
    expect(r.inspect_status?.trim()).toBe('待检验');
  });

  test('5. 验证来料检验通知API返回', async () => {
    const listRes = await apiCtx.get(`${API_BASE}/quality/quality-report/purchase-inspections?page=1&limit=50`);
    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    const listItems = listBody?.data?.items || [];
    console.log(`[检验列表API] 总数=${listItems.length}`);

    if (inspectionNumber) {
      const found = listItems.some((i: any) => i.inspection_number === inspectionNumber);
      console.log(`  找到 ${inspectionNumber} = ${found}`);
      expect(found).toBeTruthy();
    }

    const searchRes = await apiCtx.get(`${API_BASE}/quality/quality-report/purchase-inspections?page=1&limit=50&search=${encodeURIComponent(PO_NUMBER)}`);
    expect(searchRes.ok()).toBeTruthy();
    const searchBody = await searchRes.json();
    const searchItems = searchBody?.data?.items || [];
    console.log(`[搜索API] 按PO号搜索: ${searchItems.length} 条`);
    expect(searchItems.length).toBeGreaterThan(0);
  });

  test('6. 验证待检仓库存', async () => {
    if (!inspItemNumber) { test.skip(); return; }

    const whRows = await query<any>(
      `SELECT TOP 1 warehouse_number FROM warehouse WHERE warehouse_name = N'待检仓' OR warehouse_type = N'待检仓'`
    );
    const inspWh = whRows.length > 0 ? whRows[0].warehouse_number : '09';

    const batchRows = await query<any>(
      `SELECT quantity FROM material_batch_inventory WHERE item_number = @item AND warehouse_number = @wh AND quantity > 0`,
      { item: { type: T.NVarChar, value: inspItemNumber }, wh: { type: T.NVarChar, value: inspWh } }
    );
    const total = batchRows.reduce((s: number, b: any) => s + (parseFloat(b.quantity) || 0), 0);
    console.log(`[待检仓] ${inspItemNumber} 库存=${total}`);
    expect(total).toBeGreaterThan(0);
  });
});