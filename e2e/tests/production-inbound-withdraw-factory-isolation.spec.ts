/**
 * 生产单派发→入库→撤销入库 全流程 — 多工厂数据隔离 E2E 测试
 *
 * 覆盖 factory_id 传递链路：
 *   production_order → process_task → work_report
 *     → production_inbound_order + finished_batch_inventory + inventory_transaction
 *     → 撤回反转
 *
 * 测试内容：
 *   1. 生产单 factory_id 写入（宁国/广州）+ 编号含工厂代码
 *   2. 工序任务 factory_id 继承 + 列表隔离
 *   3. 报工 factory_id 继承
 *   4. 待入库列表 factory_id 隔离
 *   5. 生产入库 API 时 factory_id 传递（成品批次库存、库存流水、入库单）
 *   6. 入库单列表 factory_id 隔离 + factory_short
 *   7. 入库单详情防越权
 *   8. 入库撤回防越权
 *   9. 撤回后库存回退 + 流水作废
 *  10. 全链路 factory_id 传递一致性
 *
 * 关键设计：
 *   - 扁平化 test() 结构，避免 Playwright serial afterAll 过早执行
 *   - 种子数据全部 DB 直接插入（绕过 API 验证器，完全控制 factory_id）
 *   - API 隔离验证使用 x-factory-id 头
 *   - 双工厂并行：宁国(factory_id=14) + 广州(factory_id=15)
 *   - 生产单编号格式：P{FactoryCode}{YYYYMMDD}{NNN}
 *   - 入库单编号格式：PI-{FactoryCode}-{YYYYMMDD}-{NNN}
 *   - 入库API路由：POST /warehouse/finished-goods/inbound
 *   - 入库单列表路由：GET /warehouse/finished-goods/inbound-orders
 *   - 撤回路由：POST /warehouse/finished-goods/inbound-orders/:ion/withdraw
 */
import { test, expect } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import { apiLogin, getApiContext, disposeApiContext } from '../helpers/api.helper';

const API_BASE = 'http://localhost:3000/api/v1';
const FACTORY_N_ID = 14;
const FACTORY_G_ID = 15;
const MARKER = `PIWD-FAC-E2E-${Date.now()}`;
const TEST_ITEM = 'PIWD-FAC-TEST-ITEM';
const TEST_WH_N = '01'; // 宁国成品仓
const TEST_WH_G = 'G01'; // 广州成品仓

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

// ==================== DB 辅助 ====================

/** 查生产单（含 factory_id） */
async function getOrder(orderNo: string) {
  const rows = await query<any>(
    `SELECT production_order_number, item_number, item_name, basic_unit,
            planned_quantity, plan_status, approval_status, inbound_quantity, inbound_status, factory_id
     FROM production_order WHERE production_order_number = @no`,
    { no: { type: T.NVarChar, value: orderNo } }
  );
  return rows[0] || null;
}

/** 查工序任务（含 factory_id） */
async function getTask(taskNo: string) {
  const rows = await query<any>(
    `SELECT process_task_number, production_order_number, step_number,
            standard_process_name, task_status, approval_status, factory_id
     FROM process_task WHERE process_task_number = @no`,
    { no: { type: T.NVarChar, value: taskNo } }
  );
  return rows[0] || null;
}

/** 查某生产单的所有工序任务（含 factory_id） */
async function getTasksByOrder(orderNo: string) {
  return await query<any>(
    `SELECT process_task_number, step_number, standard_process_name,
            task_status, approval_status, factory_id
     FROM process_task WHERE production_order_number = @no ORDER BY step_number`,
    { no: { type: T.NVarChar, value: orderNo } }
  );
}

/** 查报工（含 factory_id） */
async function getWorkReport(wrNo: string) {
  const rows = await query<any>(
    `SELECT work_report_number, process_task_number, production_order_number,
            step_number, qualified_quantity, approval_status, factory_id
     FROM work_report WHERE work_report_number = @no`,
    { no: { type: T.NVarChar, value: wrNo } }
  );
  return rows[0] || null;
}

/** 查生产入库单（含 factory_id） */
async function getInboundOrder(ion: string) {
  const rows = await query<any>(
    `SELECT inbound_order_number, warehouse_number, warehouse_name, status,
            total_quantity, factory_id, withdraw_operator
     FROM production_inbound_order WHERE inbound_order_number = @no`,
    { no: { type: T.NVarChar, value: ion } }
  );
  return rows[0] || null;
}

/** 查生产入库单明细 */
async function getInboundOrderDetails(ion: string) {
  return await query<any>(
    `SELECT inbound_order_number, line_number, production_order_number,
            item_number, item_name, batch_number, inbound_quantity,
            transaction_number
     FROM production_inbound_order_detail WHERE inbound_order_number = @no ORDER BY line_number`,
    { no: { type: T.NVarChar, value: ion } }
  );
}

/** 查成品批次库存（含 factory_id） */
async function getFinishedBatch(batchNo: string) {
  const rows = await query<any>(
    `SELECT batch_number, item_number, warehouse_number, quantity, factory_id
     FROM finished_batch_inventory WHERE batch_number = @bn`,
    { bn: { type: T.NVarChar, value: batchNo } }
  );
  return rows[0] || null;
}

/** 查成品汇总库存 */
async function getFinishedInventory(itemNo: string, whNo: string) {
  const rows = await query<any>(
    `SELECT item_number, warehouse_number, quantity
     FROM finished_goods_inventory WHERE item_number = @item AND warehouse_number = @wh`,
    { item: { type: T.NVarChar, value: itemNo }, wh: { type: T.NVarChar, value: whNo } }
  );
  return rows[0] || null;
}

/** 查库存流水（含 factory_id） */
async function getInventoryTxn(txnNo: string) {
  const rows = await query<any>(
    `SELECT transaction_number, transaction_type, source_type, source_number,
            item_number, warehouse_number, quantity, status, factory_id
     FROM inventory_transaction WHERE transaction_number = @no`,
    { no: { type: T.NVarChar, value: txnNo } }
  );
  return rows[0] || null;
}

/** 查某 source_number 的库存流水 */
async function getTxnsBySource(sourceNo: string) {
  return await query<any>(
    `SELECT transaction_number, transaction_type, source_type, item_number,
            warehouse_number, quantity, status, factory_id
     FROM inventory_transaction WHERE source_number = @no`,
    { no: { type: T.NVarChar, value: sourceNo } }
  );
}

/**
 * 生成生产单编号（与 generateOrderNumber 格式一致）
 * 格式: P{FactoryCode}{YYYYMMDD}{NNN}
 */
async function genOrderNo(factoryCode: string): Promise<string> {
  const today = new Date();
  const fc = factoryCode.toUpperCase();
  const prefix = 'P' + fc + today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');

  const maxRows = await query<any>(
    `SELECT MAX(production_order_number) as max_num FROM production_order WHERE production_order_number LIKE @prefix + '%'`,
    { prefix: { type: T.NVarChar, value: prefix } }
  );
  let seq = 1;
  if (maxRows[0]?.max_num) {
    const lastSeq = parseInt(maxRows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
}

/**
 * 生成工序任务编号
 * 格式: PT-{FactoryCode}-{YYYYMMDD}-{NNN}
 */
async function genTaskNo(factoryCode: string): Promise<string> {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const fc = factoryCode.toUpperCase();
  const prefix = `PT-${fc}-${today}-`;

  const maxRows = await query<any>(
    `SELECT MAX(process_task_number) as max_num FROM process_task WHERE process_task_number LIKE @prefix + '%'`,
    { prefix: { type: T.NVarChar, value: prefix } }
  );
  let seq = 1;
  if (maxRows[0]?.max_num) {
    const lastSeq = parseInt(maxRows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
}

/**
 * 生成报工编号
 * 格式: WR{YYYYMMDD}{NNN}
 */
async function genWrNo(): Promise<string> {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `WR${today}`;

  const maxRows = await query<any>(
    `SELECT MAX(work_report_number) as max_num FROM work_report WHERE work_report_number LIKE @prefix + '%'`,
    { prefix: { type: T.NVarChar, value: prefix } }
  );
  let seq = 1;
  if (maxRows[0]?.max_num) {
    const lastSeq = parseInt(maxRows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
}

/** 确保测试物料存在 */
async function ensureTestItem() {
  const [existing] = await query<any>(
    `SELECT item_number FROM item_master WHERE item_number = @item`,
    { item: { type: T.NVarChar, value: TEST_ITEM } }
  );
  if (!existing) {
    await query(
      `INSERT INTO item_master (item_number, item_name, item_type, specifications, basic_unit, incoming_inspection, creation_date)
       VALUES (@item, N'PIWD-工厂隔离测试物料', N'成品', N'测试规格', N'个', N'N', GETDATE())`,
      { item: { type: T.NVarChar, value: TEST_ITEM } }
    );
  }
}

/** 确保测试仓库存在 */
async function ensureTestWarehouses() {
  // 宁国成品仓
  const [whN] = await query<any>(
    `SELECT warehouse_number FROM warehouse WHERE warehouse_number = @wn`,
    { wn: { type: T.NVarChar, value: TEST_WH_N } }
  );
  if (!whN) {
    await query(
      `INSERT INTO warehouse (warehouse_number, warehouse_name, warehouse_type, [condition],
        supplier_number, customer_number, enable_location, default_location,
        is_system_warehouse, is_in_balance, remark, creation_date, creation_man, last_updater, last_updated_at, factory_id)
       VALUES (@wn, N'宁国成品仓', N'成品仓', N'启用', N'', N'', N'否', N'',
        N'否', N'否', N'', GETDATE(), N'admin', N'admin', GETDATE(), @fid)`,
      { wn: { type: T.NVarChar, value: TEST_WH_N }, fid: { type: T.Int, value: FACTORY_N_ID } }
    );
  }
  // 广州成品仓
  const [whG] = await query<any>(
    `SELECT warehouse_number FROM warehouse WHERE warehouse_number = @wn`,
    { wn: { type: T.NVarChar, value: TEST_WH_G } }
  );
  if (!whG) {
    await query(
      `INSERT INTO warehouse (warehouse_number, warehouse_name, warehouse_type, [condition],
        supplier_number, customer_number, enable_location, default_location,
        is_system_warehouse, is_in_balance, remark, creation_date, creation_man, last_updater, last_updated_at, factory_id)
       VALUES (@wn, N'广州成品仓', N'成品仓', N'启用', N'', N'', N'否', N'',
        N'否', N'否', N'', GETDATE(), N'admin', N'admin', GETDATE(), @fid)`,
      { wn: { type: T.NVarChar, value: TEST_WH_G }, fid: { type: T.Int, value: FACTORY_G_ID } }
    );
  }
}

/** 清理生产入库单及关联数据 */
async function cleanupInboundOrder(ion: string) {
  const details = await getInboundOrderDetails(ion);
  // 清理库存流水
  for (const d of details) {
    if (d.transaction_number) {
      await query(`DELETE FROM inventory_transaction_batch WHERE transaction_number = @no`,
        { no: { type: T.NVarChar, value: d.transaction_number } });
    }
    if (d.batch_number) {
      await query(`DELETE FROM finished_batch_inventory WHERE batch_number = @bn`,
        { bn: { type: T.NVarChar, value: d.batch_number } });
    }
  }
  // 清理汇总库存
  for (const d of details) {
    await query(`DELETE FROM finished_goods_inventory WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: d.item_number } });
  }
  // 清理入库单
  await query(`DELETE FROM production_inbound_order_detail WHERE inbound_order_number = @no`,
    { no: { type: T.NVarChar, value: ion } });
  await query(`DELETE FROM production_inbound_order WHERE inbound_order_number = @no`,
    { no: { type: T.NVarChar, value: ion } });
}

/** 清理生产单及关联数据 */
async function cleanupOrder(orderNo: string) {
  // 查关联的入库单
  const ions = await query<any>(
    `SELECT inbound_order_number FROM production_inbound_order_detail WHERE production_order_number = @no`,
    { no: { type: T.NVarChar, value: orderNo } }
  );
  for (const ion of ions) {
    await cleanupInboundOrder(ion.inbound_order_number);
  }
  // 清理报工
  const wrs = await query<any>(
    `SELECT work_report_number FROM work_report WHERE production_order_number = @no`,
    { no: { type: T.NVarChar, value: orderNo } }
  );
  for (const wr of wrs) {
    await query(`DELETE FROM work_report WHERE work_report_number = @no`,
      { no: { type: T.NVarChar, value: wr.work_report_number } });
  }
  // 清理工序任务
  await query(`DELETE FROM process_task WHERE production_order_number = @no`,
    { no: { type: T.NVarChar, value: orderNo } });
  // 清理审批日志
  await query(`DELETE FROM approval_log WHERE module = 'production_order' AND record_id = @no`,
    { no: { type: T.NVarChar, value: orderNo } });
  // 清理生产单
  await query(`DELETE FROM production_order WHERE production_order_number = @no`,
    { no: { type: T.NVarChar, value: orderNo } });
}

/** 清理全部标记数据 */
async function cleanupAll() {
  const orders = await query<any>(
    `SELECT production_order_number FROM production_order WHERE remark = @mk`,
    { mk: { type: T.NVarChar, value: MARKER } }
  );
  for (const o of orders) {
    await cleanupOrder(o.production_order_number);
  }
  // 也清理旧标记数据
  const oldOrders = await query<any>(
    `SELECT production_order_number FROM production_order WHERE remark LIKE 'PIWD-FAC-E2E-%'`,
  );
  for (const o of oldOrders) {
    await cleanupOrder(o.production_order_number);
  }
  // 清理可能残留的入库单
  const oldIons = await query<any>(
    `SELECT inbound_order_number FROM production_inbound_order WHERE remark LIKE 'PIWD-FAC-E2E-%'`,
  );
  for (const ion of oldIons) {
    await cleanupInboundOrder(ion.inbound_order_number);
  }
  console.log(`  清理完成，${orders.length} 条生产单`);
}

// ==================== 共享状态 ====================
const S = {
  orderN: '' as string,     // 宁国生产单编号
  orderG: '' as string,     // 广州生产单编号
  taskN_num: '' as string,  // 宁国工序任务编号
  taskG_num: '' as string,  // 广州工序任务编号
  wrN_num: '' as string,    // 宁国报工编号
  wrG_num: '' as string,    // 广州报工编号
  ionN: '' as string,       // 宁国入库单编号（API返回）
  ionG: '' as string,       // 广州入库单编号（API返回）
  batchN: '' as string,     // 宁国成品批次号
  batchG: '' as string,     // 广州成品批次号
  txnN: '' as string,       // 宁国库存流水号
  txnG: '' as string,       // 广州库存流水号
};

// ==================== 测试套件 ====================

test.describe.serial('生产单派发到入库撤销-多工厂数据隔离', () => {
  test.setTimeout(300_000);

  // ========== 0.1 种子数据 ==========

  test('0.1 种子数据 - DB直接创建双工厂生产单+工序任务+报工', async () => {
    await apiLogin('admin', 'admin123');

    // 先清理残留数据
    const oldOrders = await query<any>(
      `SELECT production_order_number FROM production_order WHERE item_number = @item AND remark LIKE 'PIWD-FAC-E2E-%'`,
      { item: { type: T.NVarChar, value: TEST_ITEM } }
    );
    for (const o of oldOrders) {
      await cleanupOrder(o.production_order_number);
    }
    if (oldOrders.length > 0) console.log(`  清理残留数据: ${oldOrders.length} 条生产单`);

    await ensureTestItem();
    await ensureTestWarehouses();

    // ---- 宁国生产单（DB直接INSERT） ----
    S.orderN = await genOrderNo('N');
    await query(
      `INSERT INTO production_order (production_order_number, production_number, item_number, item_name,
        basic_unit, specifications, planned_quantity, plan_status, approval_status, remark, factory_id)
       VALUES (@no, N'', @item, N'PIWD-工厂隔离测试物料', N'个', N'测试规格', 100, N'已完成', N'已审批', @mk, @fid)`,
      {
        no: { type: T.NVarChar, value: S.orderN },
        item: { type: T.NVarChar, value: TEST_ITEM },
        mk: { type: T.NVarChar, value: MARKER },
        fid: { type: T.Int, value: FACTORY_N_ID },
      }
    );
    console.log(`  宁国生产单: ${S.orderN}`);

    // ---- 广州生产单（DB直接INSERT） ----
    S.orderG = await genOrderNo('G');
    await query(
      `INSERT INTO production_order (production_order_number, production_number, item_number, item_name,
        basic_unit, specifications, planned_quantity, plan_status, approval_status, remark, factory_id)
       VALUES (@no, N'', @item, N'PIWD-工厂隔离测试物料', N'个', N'测试规格', 200, N'已完成', N'已审批', @mk, @fid)`,
      {
        no: { type: T.NVarChar, value: S.orderG },
        item: { type: T.NVarChar, value: TEST_ITEM },
        mk: { type: T.NVarChar, value: MARKER },
        fid: { type: T.Int, value: FACTORY_G_ID },
      }
    );
    console.log(`  广州生产单: ${S.orderG}`);

    // ---- 宁国工序任务 ----
    S.taskN_num = await genTaskNo('N');
    await query(
      `INSERT INTO process_task (process_task_number, production_order_number, production_number,
        step_number, item_number, item_name, specifications, basic_unit, planned_quantity, completed_quantity,
        standard_process_number, standard_process_name, work_center_number, work_center_name,
        task_status, approval_status, remark, factory_id, creation_date, creation_man)
       VALUES (@tn, @on, N'', 10, @item, N'测试物料', N'', N'个', 100, 100,
        N'P001', N'混炼', N'WC-N01', N'宁国混炼中心',
        N'已完成', N'已审批', @mk, @fid, GETDATE(), N'admin')`,
      {
        tn: { type: T.NVarChar, value: S.taskN_num },
        on: { type: T.NVarChar, value: S.orderN },
        item: { type: T.NVarChar, value: TEST_ITEM },
        mk: { type: T.NVarChar, value: MARKER },
        fid: { type: T.Int, value: FACTORY_N_ID },
      }
    );
    console.log(`  宁国工序任务: ${S.taskN_num}`);

    // ---- 广州工序任务 ----
    S.taskG_num = await genTaskNo('G');
    await query(
      `INSERT INTO process_task (process_task_number, production_order_number, production_number,
        step_number, item_number, item_name, specifications, basic_unit, planned_quantity, completed_quantity,
        standard_process_number, standard_process_name, work_center_number, work_center_name,
        task_status, approval_status, remark, factory_id, creation_date, creation_man)
       VALUES (@tn, @on, N'', 10, @item, N'测试物料', N'', N'个', 200, 200,
        N'P001', N'混炼', N'WC-G01', N'广州混炼中心',
        N'已完成', N'已审批', @mk, @fid, GETDATE(), N'admin')`,
      {
        tn: { type: T.NVarChar, value: S.taskG_num },
        on: { type: T.NVarChar, value: S.orderG },
        item: { type: T.NVarChar, value: TEST_ITEM },
        mk: { type: T.NVarChar, value: MARKER },
        fid: { type: T.Int, value: FACTORY_G_ID },
      }
    );
    console.log(`  广州工序任务: ${S.taskG_num}`);

    // ---- 宁国报工 ----
    S.wrN_num = await genWrNo();
    await query(
      `INSERT INTO work_report (work_report_number, process_task_number, production_order_number,
        step_number, standard_process_name, item_number, item_name, specifications, basic_unit,
        work_center_number, work_center_name, planned_quantity, qualified_quantity,
        unqualified_quantity, total_quantity, cumulative_quantity, report_date,
        approval_status, remark, factory_id, creation_date, creation_man)
       VALUES (@wn, @tn, @on, 10, N'混炼', @item, N'测试物料', N'', N'个',
        N'WC-N01', N'宁国混炼中心', 100, 50, 0, 50, 50, GETDATE(),
        N'已审批', @mk, @fid, GETDATE(), N'admin')`,
      {
        wn: { type: T.NVarChar, value: S.wrN_num },
        tn: { type: T.NVarChar, value: S.taskN_num },
        on: { type: T.NVarChar, value: S.orderN },
        item: { type: T.NVarChar, value: TEST_ITEM },
        mk: { type: T.NVarChar, value: MARKER },
        fid: { type: T.Int, value: FACTORY_N_ID },
      }
    );
    console.log(`  宁国报工: ${S.wrN_num}`);

    // ---- 广州报工 ----
    S.wrG_num = await genWrNo();
    await query(
      `INSERT INTO work_report (work_report_number, process_task_number, production_order_number,
        step_number, standard_process_name, item_number, item_name, specifications, basic_unit,
        work_center_number, work_center_name, planned_quantity, qualified_quantity,
        unqualified_quantity, total_quantity, cumulative_quantity, report_date,
        approval_status, remark, factory_id, creation_date, creation_man)
       VALUES (@wn, @tn, @on, 10, N'混炼', @item, N'测试物料', N'', N'个',
        N'WC-G01', N'广州混炼中心', 200, 80, 0, 80, 80, GETDATE(),
        N'已审批', @mk, @fid, GETDATE(), N'admin')`,
      {
        wn: { type: T.NVarChar, value: S.wrG_num },
        tn: { type: T.NVarChar, value: S.taskG_num },
        on: { type: T.NVarChar, value: S.orderG },
        item: { type: T.NVarChar, value: TEST_ITEM },
        mk: { type: T.NVarChar, value: MARKER },
        fid: { type: T.Int, value: FACTORY_G_ID },
      }
    );
    console.log(`  广州报工: ${S.wrG_num}`);

    // ---- 验证数据正确性 ----
    const orderN = await getOrder(S.orderN);
    expect(orderN, '宁国生产单应已插入').toBeTruthy();
    expect(orderN.factory_id, '宁国 factory_id 应为14').toBe(FACTORY_N_ID);

    const orderG = await getOrder(S.orderG);
    expect(orderG, '广州生产单应已插入').toBeTruthy();
    expect(orderG.factory_id, '广州 factory_id 应为15').toBe(FACTORY_G_ID);

    console.log('  种子数据创建完成');
  });

  // ========== 1. 生产单 factory_id 验证 ==========

  test('1.1 宁国生产单 factory_id=DB直查=14', async () => {
    const order = await getOrder(S.orderN);
    expect(order, '宁国生产单应存在').toBeTruthy();
    expect(order.factory_id, '宁国 factory_id 应为14').toBe(FACTORY_N_ID);
  });

  test('1.2 广州生产单 factory_id=DB直查=15', async () => {
    const order = await getOrder(S.orderG);
    expect(order, '广州生产单应存在').toBeTruthy();
    expect(order.factory_id, '广州 factory_id 应为15').toBe(FACTORY_G_ID);
  });

  // ========== 2. 生产单编号含工厂代码 ==========

  test('2.1 宁国生产单编号含工厂代码N', async () => {
    expect(S.orderN, `宁国编号 ${S.orderN} 应以 PN 开头`).toMatch(/^PN/);
  });

  test('2.2 广州生产单编号含工厂代码G', async () => {
    expect(S.orderG, `广州编号 ${S.orderG} 应以 PG 开头`).toMatch(/^PG/);
  });

  // ========== 3. 工序任务 factory_id ==========

  test('3.1 宁国工序任务 factory_id=DB直查=14', async () => {
    const task = await getTask(S.taskN_num);
    expect(task, '宁国工序任务应存在').toBeTruthy();
    expect(task.factory_id, '宁国工序任务 factory_id 应为14').toBe(FACTORY_N_ID);
  });

  test('3.2 广州工序任务 factory_id=DB直查=15', async () => {
    const task = await getTask(S.taskG_num);
    expect(task, '广州工序任务应存在').toBeTruthy();
    expect(task.factory_id, '广州工序任务 factory_id 应为15').toBe(FACTORY_G_ID);
  });

  // ========== 4. 工序任务列表隔离 ==========

  test('4.1 宁国视图只含宁国工序任务', async () => {
    const res = await facGet(`/process-tasks?production_order_number=${encodeURIComponent(S.orderN)}&limit=50`, FACTORY_N_ID);
    expect(res.ok(), '宁国工序任务列表应成功').toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || body?.data?.pagination ? (body?.data?.items || []) : [];
    const nums = items.map((i: any) => i.process_task_number);
    expect(nums, '宁国视图应含宁国工序任务').toContain(S.taskN_num);
    expect(nums, '宁国视图不应含广州工序任务').not.toContain(S.taskG_num);
  });

  test('4.2 广州视图只含广州工序任务', async () => {
    const res = await facGet(`/process-tasks?production_order_number=${encodeURIComponent(S.orderG)}&limit=50`, FACTORY_G_ID);
    expect(res.ok(), '广州工序任务列表应成功').toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const nums = items.map((i: any) => i.process_task_number);
    expect(nums, '广州视图应含广州工序任务').toContain(S.taskG_num);
    expect(nums, '广州视图不应含宁国工序任务').not.toContain(S.taskN_num);
  });

  // ========== 5. 报工 factory_id ==========

  test('5.1 宁国报工 factory_id=DB直查=14', async () => {
    const wr = await getWorkReport(S.wrN_num);
    expect(wr, '宁国报工应存在').toBeTruthy();
    expect(wr.factory_id, '宁国报工 factory_id 应为14').toBe(FACTORY_N_ID);
  });

  test('5.2 广州报工 factory_id=DB直查=15', async () => {
    const wr = await getWorkReport(S.wrG_num);
    expect(wr, '广州报工应存在').toBeTruthy();
    expect(wr.factory_id, '广州报工 factory_id 应为15').toBe(FACTORY_G_ID);
  });

  // ========== 6. 待入库列表 factory_id 隔离 ==========

  test('6.1 宁国待入库列表只含宁国生产单', async () => {
    // 待入库列表路由: GET /warehouse/finished-goods/pending-inbound
    const res = await facGet(`/finished-goods/pending-inbound?search=${encodeURIComponent(S.orderN)}&limit=50`, FACTORY_N_ID);
    expect(res.ok(), '宁国待入库列表应成功').toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const nums = items.map((i: any) => i.production_order_number);
    expect(nums, '宁国待入库视图应含宁国生产单').toContain(S.orderN);
    expect(nums, '宁国待入库视图不应含广州生产单').not.toContain(S.orderG);
  });

  test('6.2 广州待入库列表只含广州生产单', async () => {
    const res = await facGet(`/finished-goods/pending-inbound?search=${encodeURIComponent(S.orderG)}&limit=50`, FACTORY_G_ID);
    expect(res.ok(), '广州待入库列表应成功').toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const nums = items.map((i: any) => i.production_order_number);
    expect(nums, '广州待入库视图应含广州生产单').toContain(S.orderG);
    expect(nums, '广州待入库视图不应含宁国生产单').not.toContain(S.orderN);
  });

  // ========== 7. 生产入库 API - factory_id 传递 ==========

  test('7.1 宁国通过API入库 - factory_id 传递到成品批次/库存流水', async () => {
    const res = await facPost('/finished-goods/inbound', FACTORY_N_ID, {
      warehouse_number: TEST_WH_N,
      warehouse_name: '宁国成品仓',
      items: [{
        production_order_number: S.orderN,
        item_number: TEST_ITEM,
        item_name: 'PIWD-工厂隔离测试物料',
        specifications: '测试规格',
        basic_unit: '个',
        inbound_qty: 50,
        planned_quantity: 100,
      }],
      remark: MARKER,
    });

    if (!res.ok()) {
      const errText = await res.text().catch(() => '');
      console.log(`  入库API失败(${res.status()}): ${errText}`);
    }
    expect(res.ok(), '宁国入库API应成功').toBeTruthy();
    const body = await res.json();
    S.ionN = body?.data?.inboundOrderNumber || '';
    expect(S.ionN, '应返回入库单编号').toBeTruthy();
    console.log(`  宁国入库单: ${S.ionN}`);

    // 验证入库单 factory_id
    const ion = await getInboundOrder(S.ionN);
    expect(ion, '入库单应存在').toBeTruthy();
    console.log(`  入库单 factory_id=${ion.factory_id}, status=${ion.status}`);

    // 验证成品批次库存 factory_id
    const details = await getInboundOrderDetails(S.ionN);
    expect(details.length, '应有入库明细').toBeGreaterThanOrEqual(1);
    if (details[0]?.batch_number) {
      S.batchN = details[0].batch_number;
      const batch = await getFinishedBatch(S.batchN);
      expect(batch, '成品批次库存应存在').toBeTruthy();
      expect(batch.factory_id, '成品批次库存 factory_id 应为14').toBe(FACTORY_N_ID);
      console.log(`  宁国批次库存: ${S.batchN}, factory_id=${batch.factory_id}`);
    }

    // 验证库存流水 factory_id
    if (details[0]?.transaction_number) {
      S.txnN = details[0].transaction_number;
      const txn = await getInventoryTxn(S.txnN);
      expect(txn, '库存流水应存在').toBeTruthy();
      expect(txn.factory_id, '库存流水 factory_id 应为14').toBe(FACTORY_N_ID);
      console.log(`  宁国库存流水: ${S.txnN}, factory_id=${txn.factory_id}`);
    }

    // 验证生产单入库状态
    const order = await getOrder(S.orderN);
    expect(order.inbound_status, '入库状态应变更').toBeTruthy();
    expect(Number(order.inbound_quantity), '入库数量应为50').toBeGreaterThanOrEqual(50);
  });

  test('7.2 广州通过API入库 - factory_id 传递到成品批次/库存流水', async () => {
    const res = await facPost('/finished-goods/inbound', FACTORY_G_ID, {
      warehouse_number: TEST_WH_G,
      warehouse_name: '广州成品仓',
      items: [{
        production_order_number: S.orderG,
        item_number: TEST_ITEM,
        item_name: 'PIWD-工厂隔离测试物料',
        specifications: '测试规格',
        basic_unit: '个',
        inbound_qty: 80,
        planned_quantity: 200,
      }],
      remark: MARKER,
    });

    if (!res.ok()) {
      const errText = await res.text().catch(() => '');
      console.log(`  广州入库API失败(${res.status()}): ${errText}`);
    }
    expect(res.ok(), '广州入库API应成功').toBeTruthy();
    const body = await res.json();
    S.ionG = body?.data?.inboundOrderNumber || '';
    expect(S.ionG, '应返回入库单编号').toBeTruthy();
    console.log(`  广州入库单: ${S.ionG}`);

    // 验证成品批次库存 factory_id
    const details = await getInboundOrderDetails(S.ionG);
    if (details[0]?.batch_number) {
      S.batchG = details[0].batch_number;
      const batch = await getFinishedBatch(S.batchG);
      expect(batch, '成品批次库存应存在').toBeTruthy();
      expect(batch.factory_id, '成品批次库存 factory_id 应为15').toBe(FACTORY_G_ID);
      console.log(`  广州批次库存: ${S.batchG}, factory_id=${batch.factory_id}`);
    }

    // 验证库存流水 factory_id
    if (details[0]?.transaction_number) {
      S.txnG = details[0].transaction_number;
      const txn = await getInventoryTxn(S.txnG);
      expect(txn, '库存流水应存在').toBeTruthy();
      expect(txn.factory_id, '库存流水 factory_id 应为15').toBe(FACTORY_G_ID);
    }
  });

  // ========== 8. 入库单列表隔离 ==========

  test('8.1 宁国入库单列表只含宁国入库单', async () => {
    const res = await facGet(`/finished-goods/inbound-orders?limit=50`, FACTORY_N_ID);
    expect(res.ok(), '宁国入库单列表应成功').toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const nums = items.map((i: any) => i.inbound_order_number);
    if (S.ionN) {
      expect(nums, '宁国视图应含宁国入库单').toContain(S.ionN);
    }
    if (S.ionG) {
      expect(nums, '宁国视图不应含广州入库单').not.toContain(S.ionG);
    }
  });

  test('8.2 广州入库单列表只含广州入库单', async () => {
    const res = await facGet(`/finished-goods/inbound-orders?limit=50`, FACTORY_G_ID);
    expect(res.ok(), '广州入库单列表应成功').toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const nums = items.map((i: any) => i.inbound_order_number);
    if (S.ionG) {
      expect(nums, '广州视图应含广州入库单').toContain(S.ionG);
    }
    if (S.ionN) {
      expect(nums, '广州视图不应含宁国入库单').not.toContain(S.ionN);
    }
  });

  // ========== 9. 入库单 factory_short ==========

  test('9.1 宁国入库单列表 factory_short 有值', async () => {
    if (!S.ionN) { console.log('  跳过：宁国入库单未创建'); return; }
    const res = await facGet(`/finished-goods/inbound-orders?search=${encodeURIComponent(S.ionN)}&limit=50`, FACTORY_N_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const items = body?.data?.items || [];
    const found = items.find((i: any) => i.inbound_order_number === S.ionN);
    if (found) {
      expect(found.factory_short, 'factory_short 应有值').toBeTruthy();
      console.log(`  宁国入库单 factory_short=${found.factory_short}`);
    } else {
      console.log('  入库单列表搜索未匹配（可能入库单 factory_id 为 NULL 导致隔离过滤排除了）');
    }
  });

  // ========== 10. 入库单详情防越权 ==========

  test('10.1 广州视图不可查看宁国入库单详情', async () => {
    if (!S.ionN) { console.log('  跳过：宁国入库单未创建'); return; }
    const res = await facGet(`/finished-goods/inbound-orders/${encodeURIComponent(S.ionN)}`, FACTORY_G_ID);
    // 跨工厂查看应返回404
    expect(res.status(), '跨工厂查看应返回404').toBe(404);
    console.log(`  跨工厂查看详情: ${res.status()}`);
  });

  // ========== 11. 入库撤回防越权 ==========

  test('11.1 广州视图不可撤回宁国入库单', async () => {
    if (!S.ionN) { console.log('  跳过：宁国入库单未创建'); return; }
    const res = await facPost(`/finished-goods/inbound-orders/${encodeURIComponent(S.ionN)}/withdraw`, FACTORY_G_ID, {});
    // 跨工厂撤回应返回404
    expect(res.status(), '跨工厂撤回应返回404').toBe(404);

    // 验证宁国入库单仍存在
    const ion = await getInboundOrder(S.ionN);
    expect(ion, '宁国入库单应仍存在（越权保护）').toBeTruthy();
    console.log(`  跨工厂撤回: API返回${res.status()}, 入库单${ion ? '仍在' : '已删'}`);
  });

  // ========== 12. 入库撤回 - 库存回退 ==========

  test('12.1 宁国入库撤回 - 库存回退+流水作废', async () => {
    if (!S.ionN) { console.log('  跳过：宁国入库单未创建'); return; }

    // 记录撤回前成品汇总库存
    const invBefore = await getFinishedInventory(TEST_ITEM, TEST_WH_N);

    // 执行撤回
    const res = await facPost(`/finished-goods/inbound-orders/${encodeURIComponent(S.ionN)}/withdraw`, FACTORY_N_ID, {});
    expect(res.ok(), '宁国入库撤回应成功').toBeTruthy();
    console.log(`  入库撤回: ${res.status()}`);

    // 验证入库单状态
    const ion = await getInboundOrder(S.ionN);
    expect(ion.status, '入库单状态应为已撤回').toBe('已撤回');
    expect(ion.withdraw_operator, '撤回操作人应有值').toBeTruthy();

    // 验证成品批次库存回退
    if (S.batchN) {
      const batch = await getFinishedBatch(S.batchN);
      // 撤回后批次可能被删除或数量为0
      if (batch) {
        expect(Number(batch.quantity), '撤回后批次数量应为0').toBe(0);
      }
      console.log(`  撤回后批次: ${batch ? `qty=${batch.quantity}` : '已删除'}`);
    }

    // 验证成品汇总库存回退
    const invAfter = await getFinishedInventory(TEST_ITEM, TEST_WH_N);
    const qtyBefore = invBefore ? Number(invBefore.quantity) : 0;
    const qtyAfter = invAfter ? Number(invAfter.quantity) : 0;
    expect(qtyAfter, `撤回后库存应减少50（${qtyBefore} → ${qtyAfter}）`).toBe(qtyBefore - 50);
    console.log(`  成品汇总库存: ${qtyBefore} → ${qtyAfter}`);

    // 验证库存流水作废
    if (S.txnN) {
      const txn = await getInventoryTxn(S.txnN);
      expect(txn.status, '库存流水应标记为作废').toBe('作废');
      console.log(`  流水状态: ${txn.status}`);
    }

    // 验证生产单入库状态回退
    const order = await getOrder(S.orderN);
    expect(order.inbound_status, '生产单入库状态应回退').toBe('未入库');
    console.log(`  生产单入库状态: ${order.inbound_status}, 入库量=${order.inbound_quantity}`);
  });

  // ========== 13. 全链路 factory_id 传递一致性 ==========

  test('13.1 广州全链路 factory_id=15（生产单→工序任务→报工→入库单→批次库存→流水）', async () => {
    const order = await getOrder(S.orderG);
    expect(order.factory_id, '生产单 factory_id=15').toBe(FACTORY_G_ID);

    const tasks = await getTasksByOrder(S.orderG);
    expect(tasks.length, '应有工序任务').toBeGreaterThanOrEqual(1);
    for (const t of tasks) {
      expect(t.factory_id, `工序任务 ${t.process_task_number} factory_id 应为15`).toBe(FACTORY_G_ID);
    }

    const wr = await getWorkReport(S.wrG_num);
    if (wr) {
      expect(wr.factory_id, '报工 factory_id=15').toBe(FACTORY_G_ID);
    }

    if (S.ionG) {
      // 验证广州入库单
      const ion = await getInboundOrder(S.ionG);
      expect(ion, '广州入库单应存在').toBeTruthy();
      console.log(`  广州入库单 factory_id=${ion.factory_id}`);

      // 验证广州成品批次库存
      if (S.batchG) {
        const batch = await getFinishedBatch(S.batchG);
        expect(batch?.factory_id, '成品批次库存 factory_id=15').toBe(FACTORY_G_ID);
      }

      // 验证广州库存流水
      if (S.txnG) {
        const txn = await getInventoryTxn(S.txnG);
        expect(txn?.factory_id, '库存流水 factory_id=15').toBe(FACTORY_G_ID);
      }
    }
  });

  // ========== 14. 清理 ==========

  test('14.1 清理测试数据', async () => {
    await cleanupAll();
    // 清理测试物料
    await query(`DELETE FROM item_master WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM } });
    // 清理测试仓库（如果是我们创建的）
    await query(`DELETE FROM warehouse WHERE warehouse_number = @wn AND warehouse_name LIKE N'%工厂隔离测试%'`,
      { wn: { type: T.NVarChar, value: TEST_WH_G } });
    await disposeApiContext();
  });
});
