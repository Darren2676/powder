/**
 * 来料检验通知 E2E 测试 - 采购订单直接入库路径
 *
 * 验证场景：采购订单 PUR-20260517-003
 *   1. 获取可入库明细，检查 incoming_inspection 字段
 *   2. 创建入库单（需检验物料 qualified_quantity=0）
 *   3. 确认入库 → 物料入待检仓
 *   4. 验证：不回写 PO received_quantity（等检验后回写）
 *   5. 验证：质量管理模块可见来料检验通知
 */
import { test, expect } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import { getApiContext, disposeApiContext } from '../helpers/api.helper';

const PO_NUMBER = 'PUR-20260517-003';

test.describe.serial('来料检验通知 - 采购订单直接入库路径', () => {
  test.setTimeout(120_000);

  let apiCtx: any;

  test.beforeAll(async () => {
    apiCtx = await getApiContext();
  });

  test.afterAll(async () => {
    await disposeApiContext();
  });

  test('1. 检查采购订单存在且已审批', async () => {
    const rows = await query<any>(
      `SELECT purchase_order_number, approval_status, order_status
       FROM purchase_order WHERE purchase_order_number = @pon`,
      { pon: { type: T.NVarChar, value: PO_NUMBER } }
    );
    expect(rows.length).toBeGreaterThan(0);
    console.log(`[PO] 状态: approval=${rows[0].approval_status}, order=${rows[0].order_status}`);
    // 需要已审批才能入库
    expect(rows[0].approval_status?.trim()).toBe('已审批');
  });

  test('2. 检查可入库明细含 incoming_inspection 字段', async () => {
    const res = await apiCtx.get(`http://localhost:3000/api/v1/purchase-orders/${encodeURIComponent(PO_NUMBER)}/receivable`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    console.log(`[可入库] 明细数: ${items.length}`);
    for (const item of items) {
      console.log(`  物料: ${item.item_number} ${item.item_name}, incoming_inspection=${item.incoming_inspection}, remaining=${item.remaining}`);
    }
    expect(items.length).toBeGreaterThan(0);
    // 验证 incoming_inspection 字段存在
    for (const item of items) {
      expect(item).toHaveProperty('incoming_inspection');
    }
  });

  test('3. 查找需检验物料并执行入库', async () => {
    // 先获取可入库明细
    const receivableRes = await apiCtx.get(`http://localhost:3000/api/v1/purchase-orders/${encodeURIComponent(PO_NUMBER)}/receivable`);
    const receivableBody = await receivableRes.json();
    const items = receivableBody?.data?.items || [];
    if (items.length === 0) {
      console.log('[SKIP] 无可入库明细，可能已全部入库');
      test.skip();
      return;
    }

    // 找需检验物料
    const inspItem = items.find((i: any) => i.incoming_inspection === 'Y');
    if (!inspItem) {
      console.log('[SKIP] 没有需检验物料');
      test.skip();
      return;
    }
    console.log(`[检验物料] ${inspItem.item_number} ${inspItem.item_name}, remaining=${inspItem.remaining}`);

    // 查询待检仓编号
    const whRows = await query<any>(
      `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_name = N'待检仓' OR warehouse_type = N'待检仓'`
    );
    const inspWh = whRows.length > 0 ? whRows[0].warehouse_number : '09';
    const inspWhName = whRows.length > 0 ? whRows[0].warehouse_name : '待检仓';

    // 获取入库前PO received_quantity（用于后续验证不回写）
    const poDetailBefore = await query<any>(
      `SELECT id, received_quantity FROM purchase_order_detail WHERE purchase_order_number = @pon AND item_number = @item`,
      { pon: { type: T.NVarChar, value: PO_NUMBER }, item: { type: T.NVarChar, value: inspItem.item_number } }
    );
    const receivedBefore = poDetailBefore.length > 0 ? parseFloat(poDetailBefore[0].received_quantity) || 0 : -1;
    console.log(`[PO明细] 入库前 received_quantity=${receivedBefore}`);

    // 创建入库单
    const stockInQty = parseFloat(inspItem.remaining) || 0;
    const createRes = await apiCtx.post('http://localhost:3000/api/v1/stock-ins', {
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
          qualified_quantity: 0,  // 需检验物料合格数量=0
          unqualified_quantity: 0,
        }],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const createBody = await createRes.json();
    const stockInNumber = createBody?.data?.stock_in_number;
    const autoInspections = createBody?.data?.auto_inspections || [];
    console.log(`[入库单] stock_in_number=${stockInNumber}, auto_inspections=${JSON.stringify(autoInspections)}`);

    // 验证返回了检验单号
    expect(autoInspections.length).toBeGreaterThan(0);
    const inspectionNumber = autoInspections[0];
    console.log(`[检验单] inspection_number=${inspectionNumber}`);

    // 确认入库
    const confirmRes = await apiCtx.post(`http://localhost:3000/api/v1/stock-ins/${encodeURIComponent(stockInNumber!)}/confirm`);
    expect(confirmRes.ok()).toBeTruthy();
    console.log('[入库] 确认入库成功');

    // 等待一下让数据库写入
    await new Promise(r => setTimeout(r, 1500));

    // === 验证1: 入库明细 qualified_quantity=0, inspect_status=待检验 ===
    const sidRows = await query<any>(
      `SELECT qualified_quantity, inspect_status, inspection_number FROM stock_in_detail WHERE stock_in_number = @si AND item_number = @item`,
      { si: { type: T.NVarChar, value: stockInNumber }, item: { type: T.NVarChar, value: inspItem.item_number } }
    );
    expect(sidRows.length).toBeGreaterThan(0);
    const qualifiedQty = parseFloat(sidRows[0].qualified_quantity) || 0;
    console.log(`[入库明细] qualified_quantity=${qualifiedQty}, inspect_status=${sidRows[0].inspect_status}, inspection_number=${sidRows[0].inspection_number}`);
    expect(qualifiedQty).toBe(0);
    expect(sidRows[0].inspect_status?.trim()).toBe('待检验');
    expect(sidRows[0].inspection_number).toBeTruthy();

    // === 验证2: PO received_quantity 未被回写（与入库前相同） ===
    const poDetailAfter = await query<any>(
      `SELECT received_quantity FROM purchase_order_detail WHERE purchase_order_number = @pon AND item_number = @item`,
      { pon: { type: T.NVarChar, value: PO_NUMBER }, item: { type: T.NVarChar, value: inspItem.item_number } }
    );
    const receivedAfter = poDetailAfter.length > 0 ? parseFloat(poDetailAfter[0].received_quantity) || 0 : -1;
    console.log(`[PO明细] 入库后 received_quantity=${receivedAfter} (入库前=${receivedBefore})`);
    expect(receivedAfter).toBe(receivedBefore);

    // === 验证3: 待检仓有库存 ===
    const batchRows = await query<any>(
      `SELECT quantity, warehouse_number, warehouse_name FROM material_batch_inventory WHERE item_number = @item AND warehouse_number = @wh AND quantity > 0`,
      { item: { type: T.NVarChar, value: inspItem.item_number }, wh: { type: T.NVarChar, value: inspWh } }
    );
    const totalInspQty = batchRows.reduce((sum: number, b: any) => sum + (parseFloat(b.quantity) || 0), 0);
    console.log(`[待检仓] 批次库存合计=${totalInspQty}`);
    expect(totalInspQty).toBeGreaterThan(0);

    // === 验证4: 质量管理模块可见检验单 ===
    const inspRows = await query<any>(
      `SELECT inspection_number, inspect_status, item_number, item_name, stock_in_number
       FROM purchase_quality_inspection
       WHERE stock_in_number = @si AND item_number = @item`,
      { si: { type: T.NVarChar, value: stockInNumber }, item: { type: T.NVarChar, value: inspItem.item_number } }
    );
    console.log(`[检验单] 查询结果: ${inspRows.length} 条`);
    expect(inspRows.length).toBeGreaterThan(0);
    console.log(`[检验单] inspection_number=${inspRows[0].inspection_number}, inspect_status=${inspRows[0].inspect_status}`);
    expect(inspRows[0].inspect_status?.trim()).toBe('待检验');

    // === 验证5: 通过API获取检验列表可见 ===
    const listUrl = `http://localhost:3000/api/v1/quality/quality-report/purchase-inspections?page=1&limit=50&inspect_status=${encodeURIComponent('待检验')}`;
    const listRes = await apiCtx.get(listUrl);
    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    const listItems = listBody?.data?.items || [];
    const found = listItems.some((i: any) => i.inspection_number === inspectionNumber);
    console.log(`[检验列表] 总数=${listItems.length}, 找到目标检验单=${found}`);
    expect(found).toBeTruthy();

    console.log('\n========== 所有验证通过 ==========');
    console.log(`✅ 入库单 ${stockInNumber} 创建成功`);
    console.log(`✅ 检验单 ${inspectionNumber} 已自动创建`);
    console.log(`✅ 物料 ${inspItem.item_number} 已入待检仓，数量=${totalInspQty}`);
    console.log(`✅ PO received_quantity 未被提前回写（等检验完成后回写）`);
    console.log(`✅ 质量管理模块可见来料检验通知`);
  });
});
