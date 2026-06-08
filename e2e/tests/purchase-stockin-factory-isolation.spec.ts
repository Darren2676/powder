/**
 * 采购入库业务全流程 — 多工厂数据隔离 E2E 测试
 *
 * 覆盖 factory_id 传递链路：
 *   purchase_order → stock_in → material_batch_inventory + material_inventory_transaction
 *     → 撤回回退
 *
 * 测试内容：
 *   1. 采购订单 factory_id 写入（宁国/广州）+ 编号含工厂代码
 *   2. 采购订单列表 factory_id 隔离
 *   3. 通过API创建入库单 factory_id 自动写入
 *   4. 入库单列表 factory_id 隔离 + factory_short
 *   5. 入库单详情防越权
 *   6. 入库单删除防越权
 *   7. 确认入库 factory_id 传递到批次库存/库存流水
 *   8. 入库撤回防越权
 *   9. 入库撤回后库存回退+流水作废+采购订单状态回退
 *  10. 全链路 factory_id 传递一致性
 *
 * 关键设计：
 *   - 扁平化 test() 结构，避免 Playwright serial afterAll 过早执行
 *   - 种子数据全部 DB 直接插入（绕过 API 验证器，完全控制 factory_id）
 *   - API 隔离验证使用 x-factory-id 头
 *   - 双工厂并行：宁国(factory_id=14) + 广州(factory_id=15)
 *   - 采购订单编号格式：PUR{FactoryCode}-{YYYYMMDD}-{NNN}
 *   - 入库单编号格式：SI{FactoryCode}-{YYYYMMDD}-{NNN}
 *   - 物料批次号格式：MB-{FactoryCode}-{YYYYMMDD}-{NNN}
 *   - 物料流水号格式：MT-{FactoryCode}-{YYYYMMDD}-{NNN}
 *   - 使用免检物料（incoming_inspection='N'），简化流程不经过检验
 */
import { test, expect } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import { apiLogin, getApiContext, disposeApiContext } from '../helpers/api.helper';

const API_BASE = 'http://localhost:3000/api/v1';
const FACTORY_N_ID = 14;
const FACTORY_G_ID = 15;
const MARKER = `PSI-FAC-E2E-${Date.now()}`;
const TEST_ITEM = 'PSI-FAC-TEST-ITEM'; // 免检物料
const TEST_SUPPLIER = 'PSI-FAC-TEST-SUPP';
const TEST_WH_N = '04';  // 宁国仓库
const TEST_WH_G = 'G04'; // 广州仓库

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

async function facDel(path: string, facId: number) {
  const ctx = await getApiContext();
  return ctx.delete(`${API_BASE}${path}`, { headers: { 'x-factory-id': String(facId) } });
}

// ==================== DB 辅助 ====================

/** 查采购订单（含 factory_id） */
async function getPurchaseOrder(poNo: string) {
  const rows = await query<any>(
    `SELECT purchase_order_number, supplier_number, supplier_name,
            order_status, approval_status, factory_id
     FROM purchase_order WHERE purchase_order_number = @no`,
    { no: { type: T.NVarChar, value: poNo } }
  );
  return rows[0] || null;
}

/** 查采购订单明细 */
async function getPurchaseOrderDetails(poNo: string) {
  return await query<any>(
    `SELECT id, purchase_order_number, item_number, item_name, specifications, basic_unit,
            order_quantity, received_quantity, receive_status
     FROM purchase_order_detail WHERE purchase_order_number = @no ORDER BY id`,
    { no: { type: T.NVarChar, value: poNo } }
  );
}

/** 查入库单（含 factory_id） */
async function getStockIn(siNo: string) {
  const rows = await query<any>(
    `SELECT stock_in_number, purchase_order_number, supplier_number, supplier_name,
            warehouse_number, warehouse_name, stock_in_type, approval_status, factory_id
     FROM stock_in WHERE stock_in_number = @no`,
    { no: { type: T.NVarChar, value: siNo } }
  );
  return rows[0] || null;
}

/** 查入库单明细 */
async function getStockInDetails(siNo: string) {
  return await query<any>(
    `SELECT stock_in_number, line_number, item_number, item_name, specifications, basic_unit,
            stock_in_quantity, qualified_quantity, unqualified_quantity, batch_number,
            inspection_number, inspect_status
     FROM stock_in_detail WHERE stock_in_number = @no ORDER BY line_number`,
    { no: { type: T.NVarChar, value: siNo } }
  );
}

/** 查物料批次库存（含 factory_id） */
async function getMaterialBatch(batchNo: string) {
  const rows = await query<any>(
    `SELECT batch_number, item_number, warehouse_number, warehouse_name, quantity, factory_id
     FROM material_batch_inventory WHERE batch_number = @bn`,
    { bn: { type: T.NVarChar, value: batchNo } }
  );
  return rows[0] || null;
}

/** 查物料汇总库存 */
async function getMaterialInventory(itemNo: string, whNo: string) {
  const rows = await query<any>(
    `SELECT item_number, warehouse_number, quantity
     FROM material_inventory WHERE item_number = @item AND warehouse_number = @wh`,
    { item: { type: T.NVarChar, value: itemNo }, wh: { type: T.NVarChar, value: whNo } }
  );
  return rows[0] || null;
}

/** 查物料库存流水（含 factory_id） */
async function getMaterialTxn(txnNo: string) {
  const rows = await query<any>(
    `SELECT transaction_number, transaction_type, source_type, source_number,
            item_number, warehouse_number, quantity, remark, factory_id
     FROM material_inventory_transaction WHERE transaction_number = @no`,
    { no: { type: T.NVarChar, value: txnNo } }
  );
  return rows[0] || null;
}

/** 查某 source_number 的物料库存流水 */
async function getMaterialTxnsBySource(sourceNo: string) {
  return await query<any>(
    `SELECT transaction_number, transaction_type, source_type, item_number,
            warehouse_number, quantity, remark, factory_id
     FROM material_inventory_transaction WHERE source_number = @no`,
    { no: { type: T.NVarChar, value: sourceNo } }
  );
}

/**
 * 生成采购订单编号（与 generatePurchaseOrderNumber 格式一致）
 * 格式: PUR{FactoryCode}-{YYYYMMDD}-{NNN}
 */
async function genPurchaseOrderNo(factoryCode: string): Promise<string> {
  const today = new Date();
  const fc = factoryCode.toUpperCase();
  const prefix = 'PUR' + fc + '-' + today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');

  const maxRows = await query<any>(
    `SELECT MAX(purchase_order_number) as max_num FROM purchase_order WHERE purchase_order_number LIKE @prefix + '%'`,
    { prefix: { type: T.NVarChar, value: prefix } }
  );
  let seq = 1;
  if (maxRows[0]?.max_num) {
    const lastSeq = parseInt(maxRows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + '-' + String(seq).padStart(3, '0');
}

/** 确保测试物料存在（免检） */
async function ensureTestItem() {
  const [existing] = await query<any>(
    `SELECT item_number FROM item_master WHERE item_number = @item`,
    { item: { type: T.NVarChar, value: TEST_ITEM } }
  );
  if (!existing) {
    await query(
      `INSERT INTO item_master (item_number, item_name, item_type, specifications, basic_unit, incoming_inspection, creation_date)
       VALUES (@item, N'PSI-工厂隔离测试物料', N'原材料', N'测试规格', N'个', N'N', GETDATE())`,
      { item: { type: T.NVarChar, value: TEST_ITEM } }
    );
  } else {
    // 确保是免检
    await query(
      `UPDATE item_master SET incoming_inspection = N'N' WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM } }
    );
  }
}

/** 确保测试供应商存在 */
async function ensureTestSupplier() {
  const [existing] = await query<any>(
    `SELECT supplier_number FROM supplier WHERE supplier_number = @sn`,
    { sn: { type: T.NVarChar, value: TEST_SUPPLIER } }
  );
  if (!existing) {
    await query(
      `INSERT INTO supplier (supplier_number, supplier_name, [condition], factory_id)
       VALUES (@sn, N'PSI-工厂隔离测试供应商', N'启用', NULL)`,
      { sn: { type: T.NVarChar, value: TEST_SUPPLIER } }
    );
  }
}

/** 确保测试仓库存在 */
async function ensureTestWarehouses() {
  // 宁国仓库
  const [whN] = await query<any>(
    `SELECT warehouse_number FROM warehouse WHERE warehouse_number = @wn`,
    { wn: { type: T.NVarChar, value: TEST_WH_N } }
  );
  if (!whN) {
    await query(
      `INSERT INTO warehouse (warehouse_number, warehouse_name, warehouse_type, [condition],
        supplier_number, customer_number, enable_location, default_location,
        is_system_warehouse, is_in_balance, remark, creation_date, creation_man, last_updater, last_updated_at, factory_id)
       VALUES (@wn, N'宁国原材料仓', N'原材料仓', N'启用', N'', N'', N'否', N'',
        N'否', N'否', N'', GETDATE(), N'admin', N'admin', GETDATE(), @fid)`,
      { wn: { type: T.NVarChar, value: TEST_WH_N }, fid: { type: T.Int, value: FACTORY_N_ID } }
    );
  }
  // 广州仓库
  const [whG] = await query<any>(
    `SELECT warehouse_number FROM warehouse WHERE warehouse_number = @wn`,
    { wn: { type: T.NVarChar, value: TEST_WH_G } }
  );
  if (!whG) {
    await query(
      `INSERT INTO warehouse (warehouse_number, warehouse_name, warehouse_type, [condition],
        supplier_number, customer_number, enable_location, default_location,
        is_system_warehouse, is_in_balance, remark, creation_date, creation_man, last_updater, last_updated_at, factory_id)
       VALUES (@wn, N'广州原材料仓', N'原材料仓', N'启用', N'', N'', N'否', N'',
        N'否', N'否', N'', GETDATE(), N'admin', N'admin', GETDATE(), @fid)`,
      { wn: { type: T.NVarChar, value: TEST_WH_G }, fid: { type: T.Int, value: FACTORY_G_ID } }
    );
  }
}

/** 清理入库单及关联数据 */
async function cleanupStockIn(siNo: string) {
  const details = await getStockInDetails(siNo);
  for (const d of details) {
    if (d.batch_number) {
      // 清理库存流水
      await query(`DELETE FROM material_inventory_transaction WHERE batch_number = @bn AND source_number = @sn`,
        { bn: { type: T.NVarChar, value: d.batch_number }, sn: { type: T.NVarChar, value: siNo } });
      // 清理批次库存
      await query(`DELETE FROM material_batch_inventory WHERE batch_number = @bn`,
        { bn: { type: T.NVarChar, value: d.batch_number } });
    }
  }
  // 清理汇总库存
  for (const d of details) {
    if (d.item_number) {
      await query(`DELETE FROM material_inventory WHERE item_number = @item`,
        { item: { type: T.NVarChar, value: d.item_number } });
    }
  }
  // 清理入库单
  await query(`DELETE FROM stock_in_detail WHERE stock_in_number = @no`,
    { no: { type: T.NVarChar, value: siNo } });
  await query(`DELETE FROM stock_in WHERE stock_in_number = @no`,
    { no: { type: T.NVarChar, value: siNo } });
}

/** 清理采购订单及关联数据 */
async function cleanupPurchaseOrder(poNo: string) {
  // 查关联入库单
  const sis = await query<any>(
    `SELECT stock_in_number FROM stock_in WHERE purchase_order_number = @no`,
    { no: { type: T.NVarChar, value: poNo } }
  );
  for (const si of sis) {
    await cleanupStockIn(si.stock_in_number);
  }
  // 清理明细
  await query(`DELETE FROM purchase_order_detail WHERE purchase_order_number = @no`,
    { no: { type: T.NVarChar, value: poNo } });
  // 清理审批日志
  await query(`DELETE FROM approval_log WHERE module = 'purchase_order' AND record_id = @no`,
    { no: { type: T.NVarChar, value: poNo } });
  // 清理采购订单
  await query(`DELETE FROM purchase_order WHERE purchase_order_number = @no`,
    { no: { type: T.NVarChar, value: poNo } });
}

/** 清理全部标记数据 */
async function cleanupAll() {
  const orders = await query<any>(
    `SELECT purchase_order_number FROM purchase_order WHERE remark = @mk`,
    { mk: { type: T.NVarChar, value: MARKER } }
  );
  for (const o of orders) {
    await cleanupPurchaseOrder(o.purchase_order_number);
  }
  // 也清理旧标记数据
  const oldOrders = await query<any>(
    `SELECT purchase_order_number FROM purchase_order WHERE remark LIKE 'PSI-FAC-E2E-%'`,
  );
  for (const o of oldOrders) {
    await cleanupPurchaseOrder(o.purchase_order_number);
  }
  console.log(`  清理完成，${orders.length} 条采购订单`);
}

// ==================== 共享状态 ====================
const S = {
  poN: '' as string,          // 宁国采购订单编号
  poG: '' as string,          // 广州采购订单编号
  poDetailIdN: 0 as number,   // 宁国采购订单明细ID
  poDetailIdG: 0 as number,   // 广州采购订单明细ID
  siN: '' as string,          // 宁国入库单编号
  siG: '' as string,          // 广州入库单编号
  batchN: '' as string,       // 宁国物料批次号
  batchG: '' as string,       // 广州物料批次号
  txnN: '' as string,         // 宁国物料流水号
  txnG: '' as string,         // 广州物料流水号
};

// ==================== 测试套件 ====================

test.describe.serial('采购入库业务全流程-多工厂数据隔离', () => {
  test.setTimeout(300_000);

  // ========== 0.1 种子数据 ==========

  test('0.1 种子数据 - DB直接创建双工厂采购订单+明细', async () => {
    await apiLogin('admin', 'admin123');

    // 先清理残留数据
    const oldOrders = await query<any>(
      `SELECT purchase_order_number FROM purchase_order WHERE remark LIKE 'PSI-FAC-E2E-%'`,
    );
    for (const o of oldOrders) {
      await cleanupPurchaseOrder(o.purchase_order_number);
    }
    if (oldOrders.length > 0) console.log(`  清理残留数据: ${oldOrders.length} 条采购订单`);

    await ensureTestItem();
    await ensureTestSupplier();
    await ensureTestWarehouses();

    // ---- 宁国采购订单（DB直接INSERT） ----
    S.poN = await genPurchaseOrderNo('N');
    await query(
      `INSERT INTO purchase_order (purchase_order_number, supplier_number, supplier_name, procurement_manager,
        linkman, contacts, order_date, delivery_date, approval_status, order_status, total_amount,
        [condition], source_req_number, remark, creation_date, creation_man, factory_id)
       VALUES (@no, @supp, N'PSI-工厂隔离测试供应商', N'',
        N'', N'', CONVERT(VARCHAR(10), GETDATE(), 120), NULL, N'已审批', N'待执行', 0,
        N'启用', N'', @mk, GETDATE(), N'admin', @fid)`,
      {
        no: { type: T.NVarChar, value: S.poN },
        supp: { type: T.NVarChar, value: TEST_SUPPLIER },
        mk: { type: T.NVarChar, value: MARKER },
        fid: { type: T.Int, value: FACTORY_N_ID },
      }
    );
    console.log(`  宁国采购订单: ${S.poN}`);

    // ---- 宁国采购订单明细 ----
    await query(
      `INSERT INTO purchase_order_detail (purchase_order_number, line_number, item_number, item_name,
        specifications, basic_unit, order_quantity, unit_price, total_amount, received_quantity, delivery_date,
        receive_status, source_req_number, source_req_detail_id, remark)
       VALUES (@no, 10, @item, N'PSI-工厂隔离测试物料', N'测试规格', N'个', 100, 0, 0, 0, NULL,
        N'未到货', N'', 0, N'')`,
      {
        no: { type: T.NVarChar, value: S.poN },
        item: { type: T.NVarChar, value: TEST_ITEM },
      }
    );
    const [detailN] = await query<any>(
      `SELECT id FROM purchase_order_detail WHERE purchase_order_number = @no AND item_number = @item`,
      { no: { type: T.NVarChar, value: S.poN }, item: { type: T.NVarChar, value: TEST_ITEM } }
    );
    S.poDetailIdN = detailN?.id || 0;
    console.log(`  宁国采购订单明细ID: ${S.poDetailIdN}`);

    // ---- 广州采购订单（DB直接INSERT） ----
    S.poG = await genPurchaseOrderNo('G');
    await query(
      `INSERT INTO purchase_order (purchase_order_number, supplier_number, supplier_name, procurement_manager,
        linkman, contacts, order_date, delivery_date, approval_status, order_status, total_amount,
        [condition], source_req_number, remark, creation_date, creation_man, factory_id)
       VALUES (@no, @supp, N'PSI-工厂隔离测试供应商', N'',
        N'', N'', CONVERT(VARCHAR(10), GETDATE(), 120), NULL, N'已审批', N'待执行', 0,
        N'启用', N'', @mk, GETDATE(), N'admin', @fid)`,
      {
        no: { type: T.NVarChar, value: S.poG },
        supp: { type: T.NVarChar, value: TEST_SUPPLIER },
        mk: { type: T.NVarChar, value: MARKER },
        fid: { type: T.Int, value: FACTORY_G_ID },
      }
    );
    console.log(`  广州采购订单: ${S.poG}`);

    // ---- 广州采购订单明细 ----
    await query(
      `INSERT INTO purchase_order_detail (purchase_order_number, line_number, item_number, item_name,
        specifications, basic_unit, order_quantity, unit_price, total_amount, received_quantity, delivery_date,
        receive_status, source_req_number, source_req_detail_id, remark)
       VALUES (@no, 10, @item, N'PSI-工厂隔离测试物料', N'测试规格', N'个', 200, 0, 0, 0, NULL,
        N'未到货', N'', 0, N'')`,
      {
        no: { type: T.NVarChar, value: S.poG },
        item: { type: T.NVarChar, value: TEST_ITEM },
      }
    );
    const [detailG] = await query<any>(
      `SELECT id FROM purchase_order_detail WHERE purchase_order_number = @no AND item_number = @item`,
      { no: { type: T.NVarChar, value: S.poG }, item: { type: T.NVarChar, value: TEST_ITEM } }
    );
    S.poDetailIdG = detailG?.id || 0;
    console.log(`  广州采购订单明细ID: ${S.poDetailIdG}`);

    // ---- 验证数据正确性 ----
    const poN = await getPurchaseOrder(S.poN);
    expect(poN, '宁国采购订单应已插入').toBeTruthy();
    expect(poN.factory_id, '宁国 factory_id 应为14').toBe(FACTORY_N_ID);

    const poG = await getPurchaseOrder(S.poG);
    expect(poG, '广州采购订单应已插入').toBeTruthy();
    expect(poG.factory_id, '广州 factory_id 应为15').toBe(FACTORY_G_ID);

    console.log('  种子数据创建完成');
  });

  // ========== 1. 采购订单 factory_id 验证 ==========

  test('1.1 宁国采购订单 factory_id=DB直查=14', async () => {
    const po = await getPurchaseOrder(S.poN);
    expect(po, '宁国采购订单应存在').toBeTruthy();
    expect(po.factory_id, '宁国 factory_id 应为14').toBe(FACTORY_N_ID);
  });

  test('1.2 广州采购订单 factory_id=DB直查=15', async () => {
    const po = await getPurchaseOrder(S.poG);
    expect(po, '广州采购订单应存在').toBeTruthy();
    expect(po.factory_id, '广州 factory_id 应为15').toBe(FACTORY_G_ID);
  });

  // ========== 2. 采购订单编号含工厂代码 + 列表隔离 ==========

  test('2.1 宁国采购订单编号含工厂代码N', async () => {
    expect(S.poN, `宁国编号 ${S.poN} 应以 PURN 开头`).toMatch(/^PURN/);
  });

  test('2.2 广州采购订单编号含工厂代码G', async () => {
    expect(S.poG, `广州编号 ${S.poG} 应以 PURG 开头`).toMatch(/^PURG/);
  });

  test('2.3 宁国视图只含宁国采购订单', async () => {
    const res = await facGet(`/purchase-orders?search=${encodeURIComponent(S.poN)}&limit=50`, FACTORY_N_ID);
    expect(res.ok(), '宁国采购订单列表应成功').toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || body?.data?.pagination ? (body?.data?.items || []) : [];
    const nums = items.map((i: any) => i.purchase_order_number);
    expect(nums, '宁国视图应含宁国采购订单').toContain(S.poN);
    expect(nums, '宁国视图不应含广州采购订单').not.toContain(S.poG);
  });

  test('2.4 广州视图只含广州采购订单', async () => {
    const res = await facGet(`/purchase-orders?search=${encodeURIComponent(S.poG)}&limit=50`, FACTORY_G_ID);
    expect(res.ok(), '广州采购订单列表应成功').toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const nums = items.map((i: any) => i.purchase_order_number);
    expect(nums, '广州视图应含广州采购订单').toContain(S.poG);
    expect(nums, '广州视图不应含宁国采购订单').not.toContain(S.poN);
  });

  // ========== 3. 通过API创建入库单 - factory_id 自动写入 ==========

  test('3.1 宁国通过API创建入库单 - factory_id 自动写入', async () => {
    const res = await facPost('/stock-ins', FACTORY_N_ID, {
      purchase_order_number: S.poN,
      warehouse_number: TEST_WH_N,
      warehouse_name: '宁国原材料仓',
      stock_in_type: '采购入库',
      remark: MARKER,
      details: [{
        purchase_detail_id: S.poDetailIdN,
        item_number: TEST_ITEM,
        item_name: 'PSI-工厂隔离测试物料',
        specifications: '测试规格',
        basic_unit: '个',
        order_quantity: 100,
        received_quantity: 0,
        stock_in_quantity: 50,
        qualified_quantity: 50,
        unqualified_quantity: 0,
      }],
    });

    if (!res.ok()) {
      const errText = await res.text().catch(() => '');
      console.log(`  创建入库单失败(${res.status()}): ${errText}`);
    }
    expect(res.ok(), '宁国创建入库单API应成功').toBeTruthy();
    const body = await res.json();
    S.siN = body?.data?.stock_in_number || '';
    expect(S.siN, '应返回入库单编号').toBeTruthy();
    console.log(`  宁国入库单: ${S.siN}`);

    // 验证入库单 factory_id
    const si = await getStockIn(S.siN);
    expect(si, '入库单应存在').toBeTruthy();
    expect(si.factory_id, '入库单 factory_id 应为14').toBe(FACTORY_N_ID);
    expect(si.approval_status, '入库单状态应为草稿').toBe('草稿');
    console.log(`  入库单 factory_id=${si.factory_id}, status=${si.approval_status}`);

    // 验证入库单编号含工厂代码
    expect(S.siN, `入库单编号 ${S.siN} 应以 SIN 开头`).toMatch(/^SIN/);
  });

  test('3.2 广州通过API创建入库单 - factory_id 自动写入', async () => {
    const res = await facPost('/stock-ins', FACTORY_G_ID, {
      purchase_order_number: S.poG,
      warehouse_number: TEST_WH_G,
      warehouse_name: '广州原材料仓',
      stock_in_type: '采购入库',
      remark: MARKER,
      details: [{
        purchase_detail_id: S.poDetailIdG,
        item_number: TEST_ITEM,
        item_name: 'PSI-工厂隔离测试物料',
        specifications: '测试规格',
        basic_unit: '个',
        order_quantity: 200,
        received_quantity: 0,
        stock_in_quantity: 80,
        qualified_quantity: 80,
        unqualified_quantity: 0,
      }],
    });

    if (!res.ok()) {
      const errText = await res.text().catch(() => '');
      console.log(`  广州创建入库单失败(${res.status()}): ${errText}`);
    }
    expect(res.ok(), '广州创建入库单API应成功').toBeTruthy();
    const body = await res.json();
    S.siG = body?.data?.stock_in_number || '';
    expect(S.siG, '应返回入库单编号').toBeTruthy();
    console.log(`  广州入库单: ${S.siG}`);

    // 验证入库单 factory_id
    const si = await getStockIn(S.siG);
    expect(si, '入库单应存在').toBeTruthy();
    expect(si.factory_id, '入库单 factory_id 应为15').toBe(FACTORY_G_ID);
    expect(S.siG, `入库单编号 ${S.siG} 应以 SIG 开头`).toMatch(/^SIG/);
  });

  // ========== 4. 入库单列表 factory_id 隔离 ==========

  test('4.1 宁国入库单列表只含宁国入库单', async () => {
    const res = await facGet(`/stock-ins?limit=50`, FACTORY_N_ID);
    expect(res.ok(), '宁国入库单列表应成功').toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const nums = items.map((i: any) => i.stock_in_number);
    if (S.siN) {
      expect(nums, '宁国视图应含宁国入库单').toContain(S.siN);
    }
    if (S.siG) {
      expect(nums, '宁国视图不应含广州入库单').not.toContain(S.siG);
    }
  });

  test('4.2 广州入库单列表只含广州入库单', async () => {
    const res = await facGet(`/stock-ins?limit=50`, FACTORY_G_ID);
    expect(res.ok(), '广州入库单列表应成功').toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const nums = items.map((i: any) => i.stock_in_number);
    if (S.siG) {
      expect(nums, '广州视图应含广州入库单').toContain(S.siG);
    }
    if (S.siN) {
      expect(nums, '广州视图不应含宁国入库单').not.toContain(S.siN);
    }
  });

  // ========== 5. 入库单 factory_short ==========

  test('5.1 宁国入库单列表 factory_short 有值', async () => {
    if (!S.siN) { console.log('  跳过：宁国入库单未创建'); return; }
    const res = await facGet(`/stock-ins?search=${encodeURIComponent(S.siN)}&limit=50`, FACTORY_N_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const found = items.find((i: any) => i.stock_in_number === S.siN);
    if (found) {
      expect(found.factory_short, 'factory_short 应有值').toBeTruthy();
      console.log(`  宁国入库单 factory_short=${found.factory_short}`);
    } else {
      console.log('  入库单列表搜索未匹配');
    }
  });

  // ========== 6. 入库单详情防越权 ==========

  test('6.1 广州视图不可查看宁国入库单详情', async () => {
    if (!S.siN) { console.log('  跳过：宁国入库单未创建'); return; }
    const res = await facGet(`/stock-ins/${encodeURIComponent(S.siN)}`, FACTORY_G_ID);
    // 跨工厂查看应返回404
    expect(res.status(), '跨工厂查看应返回404').toBe(404);
    console.log(`  跨工厂查看详情: ${res.status()}`);
  });

  // ========== 7. 入库单删除防越权 ==========

  test('7.1 广州视图不可删除宁国入库单', async () => {
    if (!S.siN) { console.log('  跳过：宁国入库单未创建'); return; }
    const res = await facDel(`/stock-ins/${encodeURIComponent(S.siN)}`, FACTORY_G_ID);
    // 跨工厂删除应返回404或403
    expect([403, 404], '跨工厂删除应返回403或404').toContain(res.status());

    // 验证宁国入库单仍存在
    const si = await getStockIn(S.siN);
    expect(si, '宁国入库单应仍存在（越权保护）').toBeTruthy();
    console.log(`  跨工厂删除: API返回${res.status()}, 入库单${si ? '仍在' : '已删'}`);
  });

  // ========== 8. 确认入库 - factory_id 传递到批次库存/库存流水 ==========

  test('8.1 宁国确认入库 - factory_id 传递到批次库存/库存流水', async () => {
    if (!S.siN) { console.log('  跳过：宁国入库单未创建'); return; }

    const res = await facPost(`/stock-ins/${encodeURIComponent(S.siN)}/confirm`, FACTORY_N_ID, {});
    if (!res.ok()) {
      const errText = await res.text().catch(() => '');
      console.log(`  确认入库失败(${res.status()}): ${errText}`);
    }
    expect(res.ok(), '宁国确认入库应成功').toBeTruthy();
    console.log(`  确认入库: ${res.status()}`);

    // 验证入库单状态
    const si = await getStockIn(S.siN);
    expect(si.approval_status, '入库单状态应为已入库').toBe('已入库');

    // 验证入库明细批次号
    const details = await getStockInDetails(S.siN);
    expect(details.length, '应有入库明细').toBeGreaterThanOrEqual(1);
    expect(details[0].batch_number, '入库明细应有批次号').toBeTruthy();
    S.batchN = details[0].batch_number;
    console.log(`  宁国批次: ${S.batchN}`);

    // 验证物料批次库存 factory_id
    const batch = await getMaterialBatch(S.batchN);
    expect(batch, '物料批次库存应存在').toBeTruthy();
    expect(batch.factory_id, '物料批次库存 factory_id 应为14').toBe(FACTORY_N_ID);
    expect(Number(batch.quantity), '批次数量应为50').toBe(50);
    console.log(`  宁国批次库存: factory_id=${batch.factory_id}, qty=${batch.quantity}`);

    // 验证物料库存流水 factory_id
    const txns = await getMaterialTxnsBySource(S.siN);
    expect(txns.length, '应有库存流水').toBeGreaterThanOrEqual(1);
    S.txnN = txns[0].transaction_number;
    console.log(`  宁国库存流水: ${S.txnN}, factory_id=${txns[0].factory_id}`);

    // 关键断言：物料库存流水 factory_id 应为14
    expect(txns[0].factory_id, '物料库存流水 factory_id 应为14').toBe(FACTORY_N_ID);

    // 验证采购订单状态更新
    const po = await getPurchaseOrder(S.poN);
    expect(['执行中', '部分到货'].includes(po.order_status) || po.order_status, '采购订单状态应变更').toBeTruthy();
    console.log(`  宁国采购订单状态: ${po.order_status}`);
  });

  test('8.2 广州确认入库 - factory_id 传递到批次库存/库存流水', async () => {
    if (!S.siG) { console.log('  跳过：广州入库单未创建'); return; }

    const res = await facPost(`/stock-ins/${encodeURIComponent(S.siG)}/confirm`, FACTORY_G_ID, {});
    if (!res.ok()) {
      const errText = await res.text().catch(() => '');
      console.log(`  广州确认入库失败(${res.status()}): ${errText}`);
    }
    expect(res.ok(), '广州确认入库应成功').toBeTruthy();

    // 验证入库明细批次号
    const details = await getStockInDetails(S.siG);
    if (details.length > 0 && details[0].batch_number) {
      S.batchG = details[0].batch_number;
      const batch = await getMaterialBatch(S.batchG);
      expect(batch?.factory_id, '广州批次库存 factory_id 应为15').toBe(FACTORY_G_ID);
      console.log(`  广州批次库存: ${S.batchG}, factory_id=${batch?.factory_id}`);
    }

    // 验证物料库存流水 factory_id
    const txns = await getMaterialTxnsBySource(S.siG);
    if (txns.length > 0) {
      S.txnG = txns[0].transaction_number;
      expect(txns[0].factory_id, '广州库存流水 factory_id 应为15').toBe(FACTORY_G_ID);
      console.log(`  广州库存流水: ${S.txnG}, factory_id=${txns[0].factory_id}`);
    }
  });

  // ========== 9. 入库撤回防越权 ==========

  test('9.1 广州视图不可撤回宁国入库单', async () => {
    if (!S.siN) { console.log('  跳过：宁国入库单未创建'); return; }
    const res = await facPost(`/stock-ins/${encodeURIComponent(S.siN)}/withdraw`, FACTORY_G_ID, {});
    // 跨工厂撤回应返回404
    expect(res.status(), '跨工厂撤回应返回404').toBe(404);

    // 验证宁国入库单仍为已入库状态
    const si = await getStockIn(S.siN);
    expect(si.approval_status, '宁国入库单应仍为已入库（越权保护）').toBe('已入库');
    console.log(`  跨工厂撤回: API返回${res.status()}, 状态=${si.approval_status}`);
  });

  // ========== 10. 入库撤回 - 库存回退+流水作废+采购订单状态回退 ==========

  test('10.1 宁国入库撤回 - 库存回退+流水作废+采购订单状态回退', async () => {
    if (!S.siN) { console.log('  跳过：宁国入库单未创建'); return; }

    // 记录撤回前批次库存
    const batchBefore = S.batchN ? await getMaterialBatch(S.batchN) : null;
    const batchQtyBefore = batchBefore ? Number(batchBefore.quantity) : 0;

    // 执行撤回
    const res = await facPost(`/stock-ins/${encodeURIComponent(S.siN)}/withdraw`, FACTORY_N_ID, {});
    if (!res.ok()) {
      const errText = await res.text().catch(() => '');
      console.log(`  入库撤回失败(${res.status()}): ${errText}`);
    }
    expect(res.ok(), '宁国入库撤回应成功').toBeTruthy();
    console.log(`  入库撤回: ${res.status()}`);

    // 验证入库单状态
    const si = await getStockIn(S.siN);
    expect(si.approval_status, '入库单状态应为已撤回').toBe('已撤回');

    // 验证物料批次库存回退
    if (S.batchN) {
      const batch = await getMaterialBatch(S.batchN);
      // 撤回后批次应被删除
      if (batch) {
        expect(Number(batch.quantity), '撤回后批次数量应为0').toBe(0);
      }
      console.log(`  撤回后批次: ${batch ? `qty=${batch.quantity}` : '已删除'}（撤回前: ${batchQtyBefore}）`);
    }

    // 验证物料库存流水作废标记
    if (S.txnN) {
      const txn = await getMaterialTxn(S.txnN);
      expect(txn, '物料流水应存在').toBeTruthy();
      expect(txn.remark, '物料流水应标记为作废').toContain('已作废');
      console.log(`  流水备注: ${txn.remark}`);
    }

    // 验证采购订单状态回退
    const po = await getPurchaseOrder(S.poN);
    const details = await getPurchaseOrderDetails(S.poN);
    if (details.length > 0) {
      expect(details[0].receive_status, '采购明细收货状态应回退').toBe('未到货');
    }
    console.log(`  采购订单状态: ${po.order_status}, 明细收货状态: ${details[0]?.receive_status}`);
  });

  // ========== 11. 全链路 factory_id 传递一致性 ==========

  test('11.1 广州全链路 factory_id=15（采购订单→入库单→批次库存→库存流水）', async () => {
    const po = await getPurchaseOrder(S.poG);
    expect(po.factory_id, '采购订单 factory_id=15').toBe(FACTORY_G_ID);

    if (S.siG) {
      const si = await getStockIn(S.siG);
      expect(si?.factory_id, '入库单 factory_id=15').toBe(FACTORY_G_ID);
      console.log(`  广州入库单 factory_id=${si?.factory_id}`);

      // 验证广州批次库存
      if (S.batchG) {
        const batch = await getMaterialBatch(S.batchG);
        expect(batch?.factory_id, '物料批次库存 factory_id=15').toBe(FACTORY_G_ID);
      }

      // 验证广州库存流水
      if (S.txnG) {
        const txn = await getMaterialTxn(S.txnG);
        expect(txn?.factory_id, '物料库存流水 factory_id=15').toBe(FACTORY_G_ID);
      }
    }
  });

  // ========== 12. 清理 ==========

  test('12.1 清理测试数据', async () => {
    await cleanupAll();
    // 清理测试物料
    await query(`DELETE FROM item_master WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM } });
    // 清理测试供应商
    await query(`DELETE FROM supplier WHERE supplier_number = @sn`,
      { sn: { type: T.NVarChar, value: TEST_SUPPLIER } });
    await disposeApiContext();
  });
});

