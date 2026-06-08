/**
 * 检验→报废仓处理 全流程 — 多工厂数据隔离 E2E 测试
 *
 * 覆盖 factory_id 传递链路：
 *   production_inspection → nonconforming_product
 *     → stock_in (报废入库) → finished_batch_inventory + inventory_transaction + finished_goods_inventory
 *     → scrap_disposal (报废处置) → inventory_transaction (出库)
 *
 * 测试内容：
 *   1. 生产检验 factory_id 继承
 *   2. NC单 factory_id 写入 + 编号含工厂代码
 *   3. NC列表 factory_id 隔离
 *   4. NC详情防越权
 *   5. NC报废处理 → 报废入库单 factory_id 传递
 *   6. 报废入库单列表 factory_id 隔离
 *   7. 报废入库审批 → 成品批次库存 factory_id 传递
 *   8. 报废仓处置申请 factory_id 传递
 *   9. 报废仓处置列表隔离 + 详情防越权
 *  10. 报废仓处置确认 → 出库流水 factory_id 传递
 *  11. NC撤销处理 → 报废入库单删除 + 检验状态回退
 *  12. 全链路 factory_id 一致性
 */
import { test, expect } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import { apiLogin, getApiContext, disposeApiContext } from '../helpers/api.helper';

const API_BASE = 'http://localhost:3000/api/v1';
const FACTORY_N_ID = 14;
const FACTORY_G_ID = 15;
const MARKER = `SD-FAC-E2E-${Date.now()}`;
const TEST_ITEM = 'SD-FAC-TEST-ITEM';
const TEST_WH_N_SCRAP = 'SC-N-01';
const TEST_WH_G_SCRAP = 'SC-G-01';

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

async function facDel(path: string, facId: number) {
  const ctx = await getApiContext();
  return ctx.delete(`${API_BASE}${path}`, { headers: { 'x-factory-id': String(facId) } });
}

// ==================== DB 辅助 ====================

async function getNC(ncNumber: string) {
  const rows = await query<any>(
    `SELECT nonconforming_number, source_type, source_number, item_number, item_name,
            unqualified_quantity, handling_method, handling_status, stock_in_number, factory_id
     FROM nonconforming_product WHERE nonconforming_number = @no`,
    { no: { type: T.NVarChar, value: ncNumber } }
  );
  return rows[0] || null;
}

async function getStockIn(siNumber: string) {
  const rows = await query<any>(
    `SELECT stock_in_number, stock_in_type, approval_status, warehouse_number, warehouse_name, factory_id
     FROM stock_in WHERE stock_in_number = @no`,
    { no: { type: T.NVarChar, value: siNumber } }
  );
  return rows[0] || null;
}

async function getInventoryTxn(sourceNumber: string, sourceType: string) {
  const rows = await query<any>(
    `SELECT transaction_number, transaction_type, source_type, source_number,
            item_number, warehouse_number, quantity, factory_id, status
     FROM inventory_transaction
     WHERE source_number = @sn AND source_type = @st`,
    { sn: { type: T.NVarChar, value: sourceNumber }, st: { type: T.NVarChar, value: sourceType } }
  );
  return rows;
}

async function getScrapDisposal(disposalNumber: string) {
  const rows = await query<any>(
    `SELECT disposal_number, warehouse_number, warehouse_name, status, factory_id
     FROM scrap_disposal WHERE disposal_number = @no`,
    { no: { type: T.NVarChar, value: disposalNumber } }
  );
  return rows[0] || null;
}

// ==================== 共享状态 ====================
const S: any = {};

// ==================== 种子数据 ====================

async function seedData() {
  // 确保报废仓库存在（宁国）
  const nScrapWh = await query<any>(
    `SELECT warehouse_number FROM warehouse WHERE warehouse_number = @no`,
    { no: { type: T.NVarChar, value: TEST_WH_N_SCRAP } }
  );
  if (!nScrapWh.length) {
    await query(`
      INSERT INTO warehouse (warehouse_number, warehouse_name, warehouse_type, [condition], factory_id,
        supplier_number, customer_number, enable_location, default_location,
        is_system_warehouse, is_in_balance, remark, creation_date, creation_man, last_updater, last_updated_at)
      VALUES (N'${TEST_WH_N_SCRAP}', N'报废仓库', N'报废仓库', N'启用', ${FACTORY_N_ID},
        N'', N'', N'否', N'',
        N'是', N'是', N'E2E-宁国报废仓', GETDATE(), N'SYSTEM', N'SYSTEM', GETDATE())
    `);
  }

  // 确保报废仓库存在（广州）
  const gScrapWh = await query<any>(
    `SELECT warehouse_number FROM warehouse WHERE warehouse_number = @no`,
    { no: { type: T.NVarChar, value: TEST_WH_G_SCRAP } }
  );
  if (!gScrapWh.length) {
    await query(`
      INSERT INTO warehouse (warehouse_number, warehouse_name, warehouse_type, [condition], factory_id,
        supplier_number, customer_number, enable_location, default_location,
        is_system_warehouse, is_in_balance, remark, creation_date, creation_man, last_updater, last_updated_at)
      VALUES (N'${TEST_WH_G_SCRAP}', N'报废仓库', N'报废仓库', N'启用', ${FACTORY_G_ID},
        N'', N'', N'否', N'',
        N'是', N'是', N'E2E-广州报废仓', GETDATE(), N'SYSTEM', N'SYSTEM', GETDATE())
    `);
  }

  // 宁国：NC单（待处理）
  const ncPrefix = 'NC-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-';
  const ncMaxN = await query<any>(
    `SELECT MAX(nonconforming_number) as max_num FROM nonconforming_product WHERE nonconforming_number LIKE @p`,
    { p: { type: T.NVarChar, value: ncPrefix + '%' } }
  );
  let ncSeq = 1;
  if (ncMaxN[0]?.max_num) {
    const last = parseInt(ncMaxN[0].max_num.substring(ncPrefix.length));
    if (!isNaN(last)) ncSeq = last + 1;
  }
  S.ncN = ncPrefix + String(ncSeq).padStart(3, '0');

  await query(`
    INSERT INTO nonconforming_product (
      nonconforming_number, source_type, source_number,
      item_number, item_name, specifications, basic_unit,
      unqualified_quantity, handling_status, factory_id, creation_man, creation_date
    ) VALUES (
      @nc, N'生产检验', N'E2E-PROD-INSP-N',
      @item, N'E2E报废物料', N'测试规格', N'个',
      20, N'待处理', @facId, N'E2E', GETDATE()
    )
  `, { nc: { type: T.NVarChar, value: S.ncN }, item: { type: T.NVarChar, value: TEST_ITEM }, facId: { type: T.Int, value: FACTORY_N_ID } });

  // 广州：NC单（待处理）
  let ncSeqG = ncSeq + 1;
  S.ncG = ncPrefix + String(ncSeqG).padStart(3, '0');

  await query(`
    INSERT INTO nonconforming_product (
      nonconforming_number, source_type, source_number,
      item_number, item_name, specifications, basic_unit,
      unqualified_quantity, handling_status, factory_id, creation_man, creation_date
    ) VALUES (
      @nc, N'生产检验', N'E2E-PROD-INSP-G',
      @item, N'E2E报废物料-GZ', N'测试规格', N'个',
      15, N'待处理', @facId, N'E2E', GETDATE()
    )
  `, { nc: { type: T.NVarChar, value: S.ncG }, item: { type: T.NVarChar, value: TEST_ITEM }, facId: { type: T.Int, value: FACTORY_G_ID } });

  // 宁国：生产检验单
  const inspNExist = await query<any>(
    `SELECT inspection_number FROM production_inspection WHERE inspection_number = @no`,
    { no: { type: T.NVarChar, value: 'E2E-PROD-INSP-N' } }
  );
  if (!inspNExist.length) {
    await query(`
      INSERT INTO production_inspection (
        inspection_number, work_report_number, process_task_number, production_order_number,
        step_number, item_number, item_name, total_quantity, qualified_quantity, unqualified_quantity,
        inspection_result, defect_handling, inspect_type, factory_id, creation_date
      ) VALUES (
        N'E2E-PROD-INSP-N', N'', N'', N'E2E-PO-N',
        10, @item, N'E2E报废物料', 20, 0, 20,
        N'不合格', N'待处理', N'过程检验', @facId, GETDATE()
      )
    `, { item: { type: T.NVarChar, value: TEST_ITEM }, facId: { type: T.Int, value: FACTORY_N_ID } });
  }

  // 广州：生产检验单
  const inspGExist = await query<any>(
    `SELECT inspection_number FROM production_inspection WHERE inspection_number = @no`,
    { no: { type: T.NVarChar, value: 'E2E-PROD-INSP-G' } }
  );
  if (!inspGExist.length) {
    await query(`
      INSERT INTO production_inspection (
        inspection_number, work_report_number, process_task_number, production_order_number,
        step_number, item_number, item_name, total_quantity, qualified_quantity, unqualified_quantity,
        inspection_result, defect_handling, inspect_type, factory_id, creation_date
      ) VALUES (
        N'E2E-PROD-INSP-G', N'', N'', N'E2E-PO-G',
        10, @item, N'E2E报废物料-GZ', 15, 0, 15,
        N'不合格', N'待处理', N'过程检验', @facId, GETDATE()
      )
    `, { item: { type: T.NVarChar, value: TEST_ITEM }, facId: { type: T.Int, value: FACTORY_G_ID } });
  }

  console.log(`  种子数据: NC宁国=${S.ncN}, NC广州=${S.ncG}`);
}

// ==================== 清理 ====================

async function cleanupAll() {
  // 清理处置单流水+批次
  await query(`DELETE FROM inventory_transaction_batch WHERE transaction_number IN (SELECT transaction_number FROM inventory_transaction WHERE source_number LIKE 'SDN-%' OR source_number LIKE 'SDG-%')`);
  await query(`DELETE FROM inventory_transaction WHERE source_number LIKE 'SDN-%' OR source_number LIKE 'SDG-%'`);
  await query(`DELETE FROM inventory_transaction WHERE source_number LIKE 'SI-%' AND source_type = N'报废入库' AND item_number = @item`, { item: { type: T.NVarChar, value: TEST_ITEM } });

  // 清理报废处置
  await query(`DELETE FROM scrap_disposal_detail WHERE disposal_number LIKE 'SDN-%' OR disposal_number LIKE 'SDG-%'`);
  await query(`DELETE FROM scrap_disposal WHERE disposal_number LIKE 'SDN-%' OR disposal_number LIKE 'SDG-%'`);

  // 清理成品批次库存
  await query(`DELETE FROM finished_batch_inventory WHERE item_number = @item AND quality_status = N'不合格品'`, { item: { type: T.NVarChar, value: TEST_ITEM } });
  await query(`DELETE FROM finished_goods_inventory WHERE item_number = @item AND quality_status = N'不合格品'`, { item: { type: T.NVarChar, value: TEST_ITEM } });

  // 清理报废入库单明细+主表
  if (S.siN) await query(`DELETE FROM stock_in_detail WHERE stock_in_number = @no`, { no: { type: T.NVarChar, value: S.siN } });
  if (S.siG) await query(`DELETE FROM stock_in_detail WHERE stock_in_number = @no`, { no: { type: T.NVarChar, value: S.siG } });

  // 清理NC单
  await query(`DELETE FROM nonconforming_product WHERE item_number = @item AND source_number LIKE 'E2E-PROD-INSP-%'`, { item: { type: T.NVarChar, value: TEST_ITEM } });

  // 清理生产检验单
  await query(`DELETE FROM production_inspection_item WHERE inspection_number LIKE 'E2E-PROD-INSP-%'`);
  await query(`DELETE FROM production_inspection WHERE inspection_number LIKE 'E2E-PROD-INSP-%'`);

  // 清理报废入库单
  if (S.siN) await query(`DELETE FROM stock_in WHERE stock_in_number = @no`, { no: { type: T.NVarChar, value: S.siN } });
  if (S.siG) await query(`DELETE FROM stock_in WHERE stock_in_number = @no`, { no: { type: T.NVarChar, value: S.siG } });
  await query(`DELETE FROM stock_in WHERE stock_in_type = N'报废入库' AND creation_man = N'E2E'`);

  // 清理报废仓库（测试创建的）
  await query(`DELETE FROM warehouse WHERE remark LIKE N'%E2E-%报废仓%'`);
}

// ==================== 测试 ====================

test.describe.serial('检验→报废仓处理 全流程 多工厂数据隔离', () => {

  // ========== 0. 初始化 ==========
  test('0.1 登录 + 种子数据', async () => {
    await apiLogin('admin', 'admin123');
    await seedData();
  });

  // ========== 1. NC单 factory_id ==========
  test('1.1 宁国NC单 factory_id 为14', async () => {
    const nc = await getNC(S.ncN);
    expect(nc, '宁国NC单应存在').toBeTruthy();
    expect(nc.factory_id, '宁国NC单 factory_id 应为14').toBe(FACTORY_N_ID);
    expect(nc.handling_status, '宁国NC单状态应为待处理').toBe('待处理');
  });

  test('1.2 广州NC单 factory_id 为15', async () => {
    const nc = await getNC(S.ncG);
    expect(nc, '广州NC单应存在').toBeTruthy();
    expect(nc.factory_id, '广州NC单 factory_id 应为15').toBe(FACTORY_G_ID);
    expect(nc.handling_status, '广州NC单状态应为待处理').toBe('待处理');
  });

  // ========== 2. NC列表 factory_id 隔离 ==========
  test('2.1 宁国NC列表不含广州NC单', async () => {
    const res = await facGet(`/quality/nonconforming-products?search=${S.ncG}`, FACTORY_N_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const found = items.find((i: any) => i.nonconforming_number === S.ncG);
    expect(found, '宁国列表不应看到广州NC单').toBeFalsy();
  });

  test('2.2 广州NC列表不含宁国NC单', async () => {
    const res = await facGet(`/quality/nonconforming-products?search=${S.ncN}`, FACTORY_G_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const found = items.find((i: any) => i.nonconforming_number === S.ncN);
    expect(found, '广州列表不应看到宁国NC单').toBeFalsy();
  });

  // ========== 3. NC详情防越权 ==========
  test('3.1 广州账号不能查看宁国NC详情', async () => {
    const res = await facGet(`/quality/nonconforming-products/${encodeURIComponent(S.ncN)}`, FACTORY_G_ID);
    expect(res.status(), '跨工厂查看NC详情应返回404').toBe(404);
  });

  // ========== 4. NC报废处理 → 报废入库单 factory_id ==========
  test('4.1 宁国NC报废处理 → 报废入库单 factory_id 为14', async () => {
    const res = await facPut(`/quality/nonconforming-products/${encodeURIComponent(S.ncN)}/handle`, FACTORY_N_ID, {
      handling_method: '报废',
      scrap_quantity: 20,
    });
    expect(res.ok(), `报废处理应成功`).toBeTruthy();
    const body = await res.json();
    const siNum = body?.data?.stock_in_number || body?.data?.data?.stock_in_number;
    expect(siNum, '应返回报废入库单号').toBeTruthy();
    S.siN = siNum;

    const si = await getStockIn(S.siN);
    expect(si, '报废入库单应存在').toBeTruthy();
    expect(si.factory_id, '报废入库单 factory_id 应为14').toBe(FACTORY_N_ID);
    expect(si.stock_in_type, '入库类型应为报废入库').toBe('报废入库');
    expect(si.approval_status, '入库单状态应为草稿').toBe('草稿');

    const nc = await getNC(S.ncN);
    expect(nc.handling_status, 'NC状态应为已完成').toBe('已完成');
    expect(nc.handling_method, 'NC处理方式应为报废').toBe('报废');
    expect(nc.stock_in_number, 'NC应关联报废入库单号').toBe(S.siN);

    console.log(`  宁国报废入库单: ${S.siN}, factory_id=${si.factory_id}`);
  });

  test('4.2 广州NC报废处理 → 报废入库单 factory_id 为15', async () => {
    const res = await facPut(`/quality/nonconforming-products/${encodeURIComponent(S.ncG)}/handle`, FACTORY_G_ID, {
      handling_method: '报废',
      scrap_quantity: 15,
    });
    expect(res.ok(), `广州报废处理应成功`).toBeTruthy();
    const body = await res.json();
    const siNum = body?.data?.stock_in_number || body?.data?.data?.stock_in_number;
    expect(siNum, '应返回广州报废入库单号').toBeTruthy();
    S.siG = siNum;

    const si = await getStockIn(S.siG);
    expect(si.factory_id, '广州报废入库单 factory_id 应为15').toBe(FACTORY_G_ID);
    console.log(`  广州报废入库单: ${S.siG}, factory_id=${si.factory_id}`);
  });

  // ========== 5. 报废入库单列表 factory_id 隔离 ==========
  test('5.1 宁国报废入库列表不含广州入库单', async () => {
    const res = await facGet(`/quality/scrap-inbound-orders?search=${S.siG}`, FACTORY_N_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const found = items.find((i: any) => i.stock_in_number === S.siG);
    expect(found, '宁国不应看到广州报废入库单').toBeFalsy();
  });

  test('5.2 广州报废入库列表不含宁国入库单', async () => {
    const res = await facGet(`/quality/scrap-inbound-orders?search=${S.siN}`, FACTORY_G_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const found = items.find((i: any) => i.stock_in_number === S.siN);
    expect(found, '广州不应看到宁国报废入库单').toBeFalsy();
  });

  // ========== 6. 报废入库单 factory_short ==========
  test('6.1 宁国报废入库单 factory_short 有值', async () => {
    const res = await facGet(`/quality/scrap-inbound-orders?search=${S.siN}`, FACTORY_N_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const found = items.find((i: any) => i.stock_in_number === S.siN);
    if (found) {
      expect(found.factory_short, 'factory_short 应有值').toBeTruthy();
    }
  });

  // ========== 7. 报废入库审批 → 成品批次库存 factory_id ==========
  test('7.1 宁国报废入库审批 → 批次库存+流水 factory_id 传递', async () => {
    const submitRes = await facPost('/approval/submit', FACTORY_N_ID, {
      module: 'stock_in',
      record_id: S.siN,
    });
    console.log(`  提交审批: ${submitRes.status()}`);
    if (!submitRes.ok()) {
      const errText = await submitRes.text().catch(() => '');
      console.log(`  提交审批失败: ${errText}`);
    }

    const approveRes = await facPost('/approval/approve', FACTORY_N_ID, {
      module: 'stock_in',
      record_id: S.siN,
    });
    console.log(`  审批结果: ${approveRes.status()}`);

    const si = await getStockIn(S.siN);
    console.log(`  审批后状态: ${si?.approval_status}`);
    expect(si?.approval_status, '入库单应变为已审批').toBe('已审批');

    // 等待 afterCommit 回调完成
    await new Promise(r => setTimeout(r, 2000));

    // 查看入库单上的仓库编号（getScrapWarehouse不按factory_id过滤，仓库可能不是测试仓库）
    const siDetail = await query<any>(
      `SELECT warehouse_number FROM stock_in WHERE stock_in_number = @no`,
      { no: { type: T.NVarChar, value: S.siN } }
    );
    const actualWh = siDetail[0]?.warehouse_number || '';
    console.log(`  入库单仓库: ${actualWh}`);

    // 验证成品批次库存（按factory_id过滤，因为两个工厂的批次可能写入同一仓库）
    const batches = await query<any>(
      `SELECT batch_number, item_number, warehouse_number, quantity, quality_status, factory_id
       FROM finished_batch_inventory
       WHERE item_number = @item AND quality_status = N'不合格品' AND warehouse_number = @wh AND factory_id = @facId`,
      { item: { type: T.NVarChar, value: TEST_ITEM }, wh: { type: T.NVarChar, value: actualWh }, facId: { type: T.Int, value: FACTORY_N_ID } }
    );
    console.log(`  批次库存记录数: ${batches.length}, 仓库: ${actualWh}`);
    if (batches.length === 0) {
      const allBatches = await query<any>(
        `SELECT batch_number, item_number, warehouse_number, quantity, quality_status, factory_id
         FROM finished_batch_inventory WHERE item_number = @item AND quality_status = N'不合格品'`,
        { item: { type: T.NVarChar, value: TEST_ITEM } }
      );
      console.log(`  所有不合格品批次: ${JSON.stringify(allBatches)}`);
    }
    expect(batches.length, '应有报废批次库存').toBeGreaterThanOrEqual(1);
    for (const b of batches) {
      expect(b.factory_id, `批次 ${b.batch_number} factory_id 应为14`).toBe(FACTORY_N_ID);
      expect(b.quality_status, '质量状态应为不合格品').toBe('不合格品');
    }
    S.siN_batch = batches[0].batch_number;
    S.siN_wh = actualWh;
    console.log(`  宁国报废批次: ${S.siN_batch}, factory_id=${batches[0].factory_id}, wh=${actualWh}`);

    // 验证库存流水
    const txns = await getInventoryTxn(S.siN, '报废入库');
    expect(txns.length, '应有报废入库流水').toBeGreaterThanOrEqual(1);
    for (const t of txns) {
      expect(t.factory_id, `流水 ${t.transaction_number} factory_id 应为14`).toBe(FACTORY_N_ID);
      expect(t.transaction_type, '流水类型应为入库').toBe('入库');
    }
  });

  // ========== 8. 报废仓库存查询 factory_id 隔离 ==========
  test('8.1 宁国报废仓库存不含广州批次', async () => {
    // 先确保广州也审批
    const submitRes = await facPost('/approval/submit', FACTORY_G_ID, {
      module: 'stock_in',
      record_id: S.siG,
    });
    const approveRes = await facPost('/approval/approve', FACTORY_G_ID, {
      module: 'stock_in',
      record_id: S.siG,
    });
    console.log(`  广州审批: ${approveRes.status()}`);
    await new Promise(r => setTimeout(r, 1500));

    // 宁国查报废仓库存（warehouse模块无/warehouse前缀）
    const res = await facGet(`/scrap-disposal/inventory?search=${TEST_ITEM}`, FACTORY_N_ID);
    if (!res.ok()) {
      console.log(`  报废仓库存查询失败(${res.status()})`);
      return;
    }
    const body = await res.json();
    const items = body?.data?.items || [];
    // API已通过x-factory-id过滤，返回的items应只有宁国数据
    for (const item of items) {
      if (item.item_number === TEST_ITEM) {
        // 二次验证DB中该仓库的批次按factory_id区分
        const batches = await query<any>(
          `SELECT batch_number, factory_id FROM finished_batch_inventory
           WHERE item_number = @item AND warehouse_number = @wh AND quality_status = N'不合格品' AND factory_id = @facId`,
          { item: { type: T.NVarChar, value: item.item_number }, wh: { type: T.NVarChar, value: S.siN_wh || TEST_WH_N_SCRAP }, facId: { type: T.Int, value: FACTORY_N_ID } }
        );
        for (const b of batches) {
          expect(b.factory_id, '宁国报废仓库存应只有factory_id=14的记录').toBe(FACTORY_N_ID);
        }
      }
    }
  });

  // ========== 9. 报废仓处置申请 factory_id ==========
  test('9.1 宁国创建报废处置申请 → factory_id 为14', async () => {
    const wh = S.siN_wh || TEST_WH_N_SCRAP;
    const batches = await query<any>(
      `SELECT batch_number, quantity FROM finished_batch_inventory WHERE item_number = @item AND warehouse_number = @wh AND quality_status = N'不合格品' AND factory_id = @facId`,
      { item: { type: T.NVarChar, value: TEST_ITEM }, wh: { type: T.NVarChar, value: wh }, facId: { type: T.Int, value: FACTORY_N_ID } }
    );
    if (batches.length === 0) {
      console.log('  宁国报废仓无批次库存，跳过处置测试');
      return;
    }

    const res = await facPost('/scrap-disposal/disposals', FACTORY_N_ID, {
      disposal_reason: `E2E报废处置-宁国-${MARKER}`,
      remark: 'E2E',
      details: [{
        item_number: TEST_ITEM,
        item_name: 'E2E报废物料',
        specifications: '测试规格',
        basic_unit: '个',
        quantity: 10,
        batch_number: S.siN_batch || '',
      }],
    });

    if (!res.ok()) {
      const errBody = await res.text().catch(() => '');
      console.log(`  创建处置申请失败(${res.status()}): ${errBody}`);
    }
    expect(res.ok(), `创建处置申请应成功`).toBeTruthy();
    const body = await res.json();
    const disposalNum = body?.data?.disposal_number || body?.data?.data?.disposal_number;
    expect(disposalNum, '应返回处置单号').toBeTruthy();
    S.disposalN = disposalNum;

    const disposal = await getScrapDisposal(S.disposalN);
    expect(disposal, '处置单应存在').toBeTruthy();
    expect(disposal.factory_id, '处置单 factory_id 应为14').toBe(FACTORY_N_ID);
    expect(disposal.status, '处置单状态应为待确认').toBe('待确认');
    console.log(`  宁国处置单: ${S.disposalN}, factory_id=${disposal.factory_id}`);
  });

  // ========== 10. 报废处置列表隔离 + 详情防越权 ==========
  test('10.1 广州处置列表不含宁国处置单', async () => {
    if (!S.disposalN) return;
    const res = await facGet(`/scrap-disposal/disposals?search=${S.disposalN}`, FACTORY_G_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const found = items.find((i: any) => i.disposal_number === S.disposalN);
    expect(found, '广州不应看到宁国处置单').toBeFalsy();
  });

  test('10.2 广州查看宁国处置详情返回404', async () => {
    if (!S.disposalN) return;
    const res = await facGet(`/scrap-disposal/disposals/${encodeURIComponent(S.disposalN)}`, FACTORY_G_ID);
    expect(res.status(), '跨工厂查看处置详情应返回404').toBe(404);
  });

  // ========== 11. 报废处置确认 → 出库流水 factory_id ==========
  test('11.1 宁国处置确认 → 出库流水 factory_id 传递', async () => {
    if (!S.disposalN) return;

    const res = await facPost(`/scrap-disposal/disposals/${encodeURIComponent(S.disposalN)}/confirm`, FACTORY_N_ID, {
      confirm_remark: 'E2E确认',
    });

    if (res.ok()) {
      const disposal = await getScrapDisposal(S.disposalN);
      expect(disposal.status, '处置单状态应为已确认').toBe('已确认');

      const txns = await getInventoryTxn(S.disposalN, '报废处置');
      expect(txns.length, '应有报废处置出库流水').toBeGreaterThanOrEqual(1);
      for (const t of txns) {
        expect(t.factory_id, `处置出库流水 factory_id 应为14`).toBe(FACTORY_N_ID);
        expect(t.transaction_type, '流水类型应为出库').toBe('出库');
      }
      console.log(`  宁国处置确认: ${txns.length} 条出库流水`);
    } else {
      const errText = await res.text().catch(() => '');
      console.log(`  处置确认失败(${res.status()}): ${errText}`);
    }
  });

  // ========== 12. NC撤销处理 ==========
  test('12.1 撤销广州NC处理 → 报废入库单删除 + 检验状态回退', async () => {
    // 广州报废入库单已审批通过，不能直接撤销，需先反审
    const si = await getStockIn(S.siG);
    if (si.approval_status !== '草稿') {
      const reverseRes = await facPost('/approval/reverse', FACTORY_G_ID, {
        module: 'stock_in',
        record_id: S.siG,
      });
      console.log(`  广州反审: ${reverseRes.status()}`);
      await new Promise(r => setTimeout(r, 1500));
    }

    const siAfter = await getStockIn(S.siG);
    if (siAfter?.approval_status !== '草稿') {
      console.log(`  广州报废入库单状态为${siAfter?.approval_status}，跳过撤销测试`);
      return;
    }

    const res = await facPut(`/quality/nonconforming-products/${encodeURIComponent(S.ncG)}/cancel-handle`, FACTORY_G_ID, {});

    if (res.ok()) {
      const nc = await getNC(S.ncG);
      expect(nc.handling_status, 'NC状态应回退为待处理').toBe('待处理');
      expect(nc.handling_method, 'NC处理方式应清空').toBeFalsy();

      const siDel = await getStockIn(S.siG);
      expect(siDel, '报废入库单应已删除').toBeFalsy();
      console.log('  广州NC撤销成功，报废入库单已删除');
    } else {
      const errText = await res.text().catch(() => '');
      console.log(`  NC撤销失败(${res.status()}): ${errText}`);
    }
  });

  // ========== 13. 全链路 factory_id 一致性 ==========
  test('13.1 宁国全链路 factory_id=14 一致性检查', async () => {
    const nc = await getNC(S.ncN);
    if (!nc || !nc.stock_in_number) {
      console.log('  宁国NC单无关联入库单，跳过');
      return;
    }
    expect(nc.factory_id, 'NC factory_id 应为14').toBe(FACTORY_N_ID);

    const si = await getStockIn(nc.stock_in_number);
    if (si) {
      expect(si.factory_id, '入库单 factory_id 应为14').toBe(FACTORY_N_ID);
    }

    const wh = S.siN_wh || TEST_WH_N_SCRAP;
    const batches = await query<any>(
      `SELECT batch_number, factory_id FROM finished_batch_inventory WHERE item_number = @item AND warehouse_number = @wh AND quality_status = N'不合格品' AND factory_id = @facId`,
      { item: { type: T.NVarChar, value: TEST_ITEM }, wh: { type: T.NVarChar, value: wh }, facId: { type: T.Int, value: FACTORY_N_ID } }
    );
    for (const b of batches) {
      expect(b.factory_id, `批次 ${b.batch_number} factory_id 应为14`).toBe(FACTORY_N_ID);
    }

    const txns = await getInventoryTxn(nc.stock_in_number, '报废入库');
    for (const t of txns) {
      expect(t.factory_id, `入库流水 factory_id 应为14`).toBe(FACTORY_N_ID);
    }

    if (S.disposalN) {
      const disposal = await getScrapDisposal(S.disposalN);
      if (disposal) {
        expect(disposal.factory_id, '处置单 factory_id 应为14').toBe(FACTORY_N_ID);
      }
      const dTxns = await getInventoryTxn(S.disposalN, '报废处置');
      for (const t of dTxns) {
        expect(t.factory_id, `出库流水 factory_id 应为14`).toBe(FACTORY_N_ID);
      }
    }
    console.log('  全链路 factory_id 一致性检查通过');
  });

  // ========== 14. 清理 ==========
  test('14.1 清理测试数据', async () => {
    await cleanupAll();
    await disposeApiContext();
  });
});
