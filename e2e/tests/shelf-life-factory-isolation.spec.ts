/**
 * 有效期管理 — 多工厂数据隔离 E2E 测试
 *
 * 基于「有效期管理操作手册」，覆盖：
 *   1. 原材料批次库存 factory_id 写入 → 有效期报告按工厂隔离
 *   2. 成品批次库存 factory_id 写入 → 有效期报告按工厂隔离
 *   3. 宁国(factory_id=14)视图只含本厂批次，广州(factory_id=15)视图只含本厂批次
 *   4. 到期日计算(production_date + shelf_life_days)跨工厂一致
 *   5. 到期状态判定(已到期/即将到期/未到期)跨工厂一致
 *   6. 按物料类型/到期状态筛选 + 工厂隔离
 *   7. DB直查 factory_id 传递路径验证
 *
 * 关键设计：
 *   - 扁平化 test() 结构，避免 Playwright serial afterAll 过早执行
 *   - 种子数据直接 SQL 插入（含 factory_id），确保可控
 *   - API 隔离验证使用 x-factory-id 头
 *   - 双工厂并行：宁国(factory_id=14) + 广州(factory_id=15)
 */
import { test, expect } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import { apiLogin, getApiContext, disposeApiContext } from '../helpers/api.helper';

const API_BASE = 'http://localhost:3000/api/v1';
const FACTORY_N_ID = 14;
const FACTORY_G_ID = 15;
const SHELF_LIFE_DAYS = 90;
const EXPIRE_WARNING_DAYS = 30;

// 测试专用标记
const TAG = 'SL-FAC-E2E';
const TEST_ITEM_RAW = `${TAG}-RAW`;   // 原材料物料
const TEST_ITEM_FIN = `${TAG}-FIN`;   // 成品物料
const TEST_WH_RAW = '04';             // 原材料仓
const TEST_WH_FIN = '01';             // 成品仓

// 宁国批次编号
const BN_N_EXPIRED = `${TAG}-N-EXPIRED`;   // 宁国已到期
const BN_N_WARNING = `${TAG}-N-WARNING`;   // 宁国即将到期
const BN_N_NORMAL  = `${TAG}-N-NORMAL`;    // 宁国未到期
// 广州批次编号
const BN_G_EXPIRED = `${TAG}-G-EXPIRED`;   // 广州已到期
const BN_G_WARNING = `${TAG}-G-WARNING`;   // 广州即将到期
const BN_G_NORMAL  = `${TAG}-G-NORMAL`;    // 广州未到期

// 所有批次编号（用于清理）
const ALL_BATCHES = [BN_N_EXPIRED, BN_N_WARNING, BN_N_NORMAL, BN_G_EXPIRED, BN_G_WARNING, BN_G_NORMAL];

// 保存原始物料设置
const origItems: Record<string, any> = {};

/** 带 x-factory-id 头的 GET 请求 */
async function facGet(path: string, facId: number) {
  const ctx = await getApiContext();
  return ctx.get(`${API_BASE}${path}`, { headers: { 'x-factory-id': String(facId) } });
}

/** 从 API 响应提取 items */
function items(body: any): any[] {
  return body?.data?.items || [];
}

// ==================== 测试套件（扁平化） ====================

test.describe.serial('有效期管理-多工厂数据隔离', () => {
  test.setTimeout(300_000);

  // ========== 种子数据函数（不在 beforeAll/afterAll 中，避免过早清理） ==========

  async function seedTestData() {
    // 1. 准备原材料物料：启用有效期
    const [existingRaw] = await query<any>(
      `SELECT enable_shelf_life, shelf_life_days FROM item_master WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM_RAW } }
    );
    if (existingRaw) {
      origItems[TEST_ITEM_RAW] = { enable_shelf_life: existingRaw.enable_shelf_life, shelf_life_days: existingRaw.shelf_life_days };
    } else {
      origItems[TEST_ITEM_RAW] = null; // 标记为新建
    }
    await query(
      `IF NOT EXISTS (SELECT 1 FROM item_master WHERE item_number = @item)
       INSERT INTO item_master (item_number, item_name, item_type, specifications, basic_unit, enable_shelf_life, shelf_life_days, creation_date)
       VALUES (@item, N'E2E-工厂隔离-原材料', N'原材料', N'测试', N'KG', N'Y', @days, GETDATE())
       ELSE
       UPDATE item_master SET enable_shelf_life = N'Y', shelf_life_days = @days WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM_RAW }, days: { type: T.Int, value: SHELF_LIFE_DAYS } }
    );

    // 2. 准备成品物料：启用有效期
    const [existingFin] = await query<any>(
      `SELECT enable_shelf_life, shelf_life_days FROM item_master WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM_FIN } }
    );
    if (existingFin) {
      origItems[TEST_ITEM_FIN] = { enable_shelf_life: existingFin.enable_shelf_life, shelf_life_days: existingFin.shelf_life_days };
    } else {
      origItems[TEST_ITEM_FIN] = null;
    }
    await query(
      `IF NOT EXISTS (SELECT 1 FROM item_master WHERE item_number = @item)
       INSERT INTO item_master (item_number, item_name, item_type, specifications, basic_unit, enable_shelf_life, shelf_life_days, creation_date)
       VALUES (@item, N'E2E-工厂隔离-成品', N'成品', N'测试', N'KG', N'Y', @days, GETDATE())
       ELSE
       UPDATE item_master SET enable_shelf_life = N'Y', shelf_life_days = @days WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM_FIN }, days: { type: T.Int, value: SHELF_LIFE_DAYS } }
    );

    // 3. 获取仓库名称
    const [whRaw] = await query<any>(
      `SELECT warehouse_name FROM warehouse WHERE warehouse_number = @wh`,
      { wh: { type: T.NVarChar, value: TEST_WH_RAW } }
    );
    const whRawName = whRaw?.warehouse_name || '原材料仓库';
    const [whFin] = await query<any>(
      `SELECT warehouse_name FROM warehouse WHERE warehouse_number = @wh`,
      { wh: { type: T.NVarChar, value: TEST_WH_FIN } }
    );
    const whFinName = whFin?.warehouse_name || '成品仓库';

    // 4. 清理旧批次数据
    for (const bn of ALL_BATCHES) {
      await query(`DELETE FROM material_batch_inventory WHERE batch_number = @bn`, { bn: { type: T.NVarChar, value: bn } });
      await query(`DELETE FROM finished_batch_inventory WHERE batch_number = @bn`, { bn: { type: T.NVarChar, value: bn } });
    }

    // 5. 插入宁国批次（原材料：已到期、即将到期；成品：未到期）
    // 已到期：生产日期 = 今天 - 100天（超过90天有效期）
    const expiredDate = new Date(); expiredDate.setDate(expiredDate.getDate() - 100);
    // 即将到期：生产日期 = 今天 - 70天（剩余20天 < 30天预警）
    const warningDate = new Date(); warningDate.setDate(warningDate.getDate() - 70);
    // 未到期：生产日期 = 今天 - 10天（剩余80天）
    const normalDate = new Date(); normalDate.setDate(normalDate.getDate() - 10);

    // 宁国 - 原材料已到期
    await insertMatBatch(BN_N_EXPIRED, TEST_ITEM_RAW, 'E2E-工厂隔离-原材料', '原材料',
      TEST_WH_RAW, whRawName, expiredDate, FACTORY_N_ID);
    // 宁国 - 原材料即将到期
    await insertMatBatch(BN_N_WARNING, TEST_ITEM_RAW, 'E2E-工厂隔离-原材料', '原材料',
      TEST_WH_RAW, whRawName, warningDate, FACTORY_N_ID);
    // 宁国 - 成品未到期
    await insertFinBatch(BN_N_NORMAL, TEST_ITEM_FIN, 'E2E-工厂隔离-成品',
      TEST_WH_FIN, whFinName, normalDate, FACTORY_N_ID);

    // 6. 插入广州批次（原材料：已到期；成品：即将到期、未到期）
    // 广州 - 原材料已到期
    await insertMatBatch(BN_G_EXPIRED, TEST_ITEM_RAW, 'E2E-工厂隔离-原材料', '原材料',
      TEST_WH_RAW, whRawName, expiredDate, FACTORY_G_ID);
    // 广州 - 成品即将到期
    await insertFinBatch(BN_G_WARNING, TEST_ITEM_FIN, 'E2E-工厂隔离-成品',
      TEST_WH_FIN, whFinName, warningDate, FACTORY_G_ID);
    // 广州 - 成品未到期
    await insertFinBatch(BN_G_NORMAL, TEST_ITEM_FIN, 'E2E-工厂隔离-成品',
      TEST_WH_FIN, whFinName, normalDate, FACTORY_G_ID);

    console.log('[seed] 种子数据创建完成：宁国3批次 + 广州3批次');
  }

  /** 插入原材料批次（含 factory_id） */
  async function insertMatBatch(
    batchNo: string, itemNo: string, itemName: string, itemType: string,
    whNo: string, whName: string, prodDate: Date, factoryId: number
  ) {
    await query(
      `INSERT INTO material_batch_inventory
       (batch_number, item_number, item_name, item_type, specifications, basic_unit,
        warehouse_number, warehouse_name, quantity, initial_quantity,
        production_date, inbound_date, status, creation_date, factory_id)
       VALUES (@bn, @item, @itemName, @itemType, N'测试', N'KG',
               @wh, @whName, 100, 100,
               @pd, GETDATE(), N'正常', GETDATE(), @fid)`,
      {
        bn: { type: T.NVarChar, value: batchNo },
        item: { type: T.NVarChar, value: itemNo },
        itemName: { type: T.NVarChar, value: itemName },
        itemType: { type: T.NVarChar, value: itemType },
        wh: { type: T.NVarChar, value: whNo },
        whName: { type: T.NVarChar, value: whName },
        pd: { type: T.DateTime, value: prodDate },
        fid: { type: T.Int, value: factoryId },
      }
    );
  }

  /** 插入成品批次（含 factory_id） */
  async function insertFinBatch(
    batchNo: string, itemNo: string, itemName: string,
    whNo: string, whName: string, prodDate: Date, factoryId: number
  ) {
    await query(
      `INSERT INTO finished_batch_inventory
       (batch_number, item_number, item_name, warehouse_number, warehouse_name,
        quantity, initial_quantity, production_date, inbound_date,
        quality_status, status, creation_date, factory_id)
       VALUES (@bn, @item, @itemName, @wh, @whName,
               100, 100, @pd, GETDATE(),
               N'合格品', N'正常', GETDATE(), @fid)`,
      {
        bn: { type: T.NVarChar, value: batchNo },
        item: { type: T.NVarChar, value: itemNo },
        itemName: { type: T.NVarChar, value: itemName },
        wh: { type: T.NVarChar, value: whNo },
        whName: { type: T.NVarChar, value: whName },
        pd: { type: T.DateTime, value: prodDate },
        fid: { type: T.Int, value: factoryId },
      }
    );
  }

  async function cleanupTestData() {
    // 清理批次
    for (const bn of ALL_BATCHES) {
      await query(`DELETE FROM material_batch_inventory WHERE batch_number = @bn`, { bn: { type: T.NVarChar, value: bn } });
      await query(`DELETE FROM finished_batch_inventory WHERE batch_number = @bn`, { bn: { type: T.NVarChar, value: bn } });
    }
    // 恢复物料设置
    for (const [itemNo, orig] of Object.entries(origItems)) {
      if (orig) {
        await query(
          `UPDATE item_master SET enable_shelf_life = @esl, shelf_life_days = @sld WHERE item_number = @item`,
          {
            esl: { type: T.NVarChar, value: orig.enable_shelf_life || 'N' },
            sld: { type: T.Int, value: orig.shelf_life_days || 0 },
            item: { type: T.NVarChar, value: itemNo },
          }
        );
      } else {
        // 新建的物料删除
        await query(`DELETE FROM item_master WHERE item_number = @item`, { item: { type: T.NVarChar, value: itemNo } });
      }
    }
    console.log('[cleanup] 清理完成');
  }

  // ========== 〇、种子数据创建 ==========

  test('0.1 创建种子数据（物料+双工厂批次库存）', async () => {
    await apiLogin('admin', 'admin123');
    await getApiContext();
    await seedTestData();
    console.log('[0.1] 种子数据创建完成 ✓');
  });

  // ========== 一、批次 factory_id 直查验证 ==========

  test('1.1 宁国原材料批次 factory_id=14 写入', async () => {
    const rows = await query<any>(
      `SELECT factory_id FROM material_batch_inventory WHERE batch_number = @bn`,
      { bn: { type: T.NVarChar, value: BN_N_EXPIRED } }
    );
    expect(rows[0]?.factory_id, '宁国原材料批次 factory_id 应=14').toBe(FACTORY_N_ID);
    console.log(`[1.1] ${BN_N_EXPIRED} factory_id=14 ✓`);
  });

  test('1.2 广州原材料批次 factory_id=15 写入', async () => {
    const rows = await query<any>(
      `SELECT factory_id FROM material_batch_inventory WHERE batch_number = @bn`,
      { bn: { type: T.NVarChar, value: BN_G_EXPIRED } }
    );
    expect(rows[0]?.factory_id, '广州原材料批次 factory_id 应=15').toBe(FACTORY_G_ID);
    console.log(`[1.2] ${BN_G_EXPIRED} factory_id=15 ✓`);
  });

  test('1.3 宁国成品批次 factory_id=14 写入', async () => {
    const rows = await query<any>(
      `SELECT factory_id FROM finished_batch_inventory WHERE batch_number = @bn`,
      { bn: { type: T.NVarChar, value: BN_N_NORMAL } }
    );
    expect(rows[0]?.factory_id, '宁国成品批次 factory_id 应=14').toBe(FACTORY_N_ID);
    console.log(`[1.3] ${BN_N_NORMAL} factory_id=14 ✓`);
  });

  test('1.4 广州成品批次 factory_id=15 写入', async () => {
    const rows = await query<any>(
      `SELECT factory_id FROM finished_batch_inventory WHERE batch_number = @bn`,
      { bn: { type: T.NVarChar, value: BN_G_NORMAL } }
    );
    expect(rows[0]?.factory_id, '广州成品批次 factory_id 应=15').toBe(FACTORY_G_ID);
    console.log(`[1.4] ${BN_G_NORMAL} factory_id=15 ✓`);
  });

  // ========== 二、有效期报告 API 工厂隔离 ==========

  test('2.1 宁国有效期报告只含 factory_id=14 批次', async () => {
    const res = await facGet(`/shelf-life-report?page=1&limit=100&search=${TAG}`, FACTORY_N_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const list = items(body);
    const batchNos = list.map((i: any) => i.batch_number);

    // 宁国应包含自己的3个批次
    expect(batchNos, '宁国应含N-EXPIRED').toContain(BN_N_EXPIRED);
    expect(batchNos, '宁国应含N-WARNING').toContain(BN_N_WARNING);
    expect(batchNos, '宁国应含N-NORMAL').toContain(BN_N_NORMAL);

    // 宁国不应包含广州批次
    expect(batchNos, '宁国不应含G-EXPIRED').not.toContain(BN_G_EXPIRED);
    expect(batchNos, '宁国不应含G-WARNING').not.toContain(BN_G_WARNING);
    expect(batchNos, '宁国不应含G-NORMAL').not.toContain(BN_G_NORMAL);

    console.log(`[2.1] 宁国视图 ${list.length} 条，含3个宁国批次，0个广州批次 ✓`);
  });

  test('2.2 广州有效期报告只含 factory_id=15 批次', async () => {
    const res = await facGet(`/shelf-life-report?page=1&limit=100&search=${TAG}`, FACTORY_G_ID);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const list = items(body);
    const batchNos = list.map((i: any) => i.batch_number);

    // 广州应包含自己的3个批次
    expect(batchNos, '广州应含G-EXPIRED').toContain(BN_G_EXPIRED);
    expect(batchNos, '广州应含G-WARNING').toContain(BN_G_WARNING);
    expect(batchNos, '广州应含G-NORMAL').toContain(BN_G_NORMAL);

    // 广州不应包含宁国批次
    expect(batchNos, '广州不应含N-EXPIRED').not.toContain(BN_N_EXPIRED);
    expect(batchNos, '广州不应含N-WARNING').not.toContain(BN_N_WARNING);
    expect(batchNos, '广州不应含N-NORMAL').not.toContain(BN_N_NORMAL);

    console.log(`[2.2] 广州视图 ${list.length} 条，含3个广州批次，0个宁国批次 ✓`);
  });

  // ========== 三、到期状态判定 + 工厂隔离 ==========

  test('3.1 宁国到期状态判定：已到期/即将到期/未到期', async () => {
    const res = await facGet(`/shelf-life-report?page=1&limit=100&search=${TAG}`, FACTORY_N_ID);
    const body = await res.json();
    const list = items(body);

    const expired = list.find((i: any) => i.batch_number === BN_N_EXPIRED);
    const warning = list.find((i: any) => i.batch_number === BN_N_WARNING);
    const normal = list.find((i: any) => i.batch_number === BN_N_NORMAL);

    expect(expired, '应找到宁国已到期批次').toBeDefined();
    expect(warning, '应找到宁国即将到期批次').toBeDefined();
    expect(normal, '应找到宁国未到期批次').toBeDefined();

    expect(expired.expire_status).toBe('已到期');
    expect(warning.expire_status).toBe('即将到期');
    expect(normal.expire_status).toBe('未到期');

    console.log(`[3.1] 宁国到期状态: EXPIRED=${expired.expire_status}, WARNING=${warning.expire_status}, NORMAL=${normal.expire_status} ✓`);
  });

  test('3.2 广州到期状态判定：已到期/即将到期/未到期', async () => {
    const res = await facGet(`/shelf-life-report?page=1&limit=100&search=${TAG}`, FACTORY_G_ID);
    const body = await res.json();
    const list = items(body);

    const expired = list.find((i: any) => i.batch_number === BN_G_EXPIRED);
    const warning = list.find((i: any) => i.batch_number === BN_G_WARNING);
    const normal = list.find((i: any) => i.batch_number === BN_G_NORMAL);

    expect(expired, '应找到广州已到期批次').toBeDefined();
    expect(warning, '应找到广州即将到期批次').toBeDefined();
    expect(normal, '应找到广州未到期批次').toBeDefined();

    expect(expired.expire_status).toBe('已到期');
    expect(warning.expire_status).toBe('即将到期');
    expect(normal.expire_status).toBe('未到期');

    console.log(`[3.2] 广州到期状态: EXPIRED=${expired.expire_status}, WARNING=${warning.expire_status}, NORMAL=${normal.expire_status} ✓`);
  });

  // ========== 四、到期日计算验证 ==========

  test('4.1 到期日 = 生产日期 + 有效天数（跨工厂一致）', async () => {
    const res = await facGet(`/shelf-life-report?page=1&limit=100&search=${TAG}`, FACTORY_N_ID);
    const body = await res.json();
    const list = items(body);

    const normalItem = list.find((i: any) => i.batch_number === BN_N_NORMAL);
    expect(normalItem, '应找到宁国未到期成品批次').toBeDefined();

    const prodDate = new Date(normalItem.production_date);
    const expiryDate = new Date(normalItem.expiry_date);
    const diffDays = Math.round((expiryDate.getTime() - prodDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays, `到期日-生产日期 应=${SHELF_LIFE_DAYS}天`).toBe(SHELF_LIFE_DAYS);

    console.log(`[4.1] 宁国到期日计算: ${diffDays}天 = 生产日期+${SHELF_LIFE_DAYS} ✓`);
  });

  test('4.2 广州到期日计算与宁国一致', async () => {
    const res = await facGet(`/shelf-life-report?page=1&limit=100&search=${TAG}`, FACTORY_G_ID);
    const body = await res.json();
    const list = items(body);

    const normalItem = list.find((i: any) => i.batch_number === BN_G_NORMAL);
    expect(normalItem, '应找到广州未到期成品批次').toBeDefined();

    const prodDate = new Date(normalItem.production_date);
    const expiryDate = new Date(normalItem.expiry_date);
    const diffDays = Math.round((expiryDate.getTime() - prodDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays, `广州到期日计算应一致=${SHELF_LIFE_DAYS}天`).toBe(SHELF_LIFE_DAYS);

    console.log(`[4.2] 广州到期日计算: ${diffDays}天 = 生产日期+${SHELF_LIFE_DAYS} ✓`);
  });

  // ========== 五、筛选 + 工厂隔离 ==========

  test('5.1 按物料类型筛选(原材料)+宁国工厂隔离', async () => {
    const res = await facGet(`/shelf-life-report?page=1&limit=100&item_type=${encodeURIComponent('原材料')}&search=${TAG}`, FACTORY_N_ID);
    const body = await res.json();
    const list = items(body);

    // 宁国原材料应只有2条（已到期+即将到期）
    const batchNos = list.map((i: any) => i.batch_number);
    expect(batchNos).toContain(BN_N_EXPIRED);
    expect(batchNos).toContain(BN_N_WARNING);
    expect(batchNos).not.toContain(BN_N_NORMAL);  // 成品
    expect(batchNos).not.toContain(BN_G_EXPIRED); // 广州
    expect(batchNos).not.toContain(BN_G_WARNING); // 广州

    // 所有返回的 item_type 应为原材料
    for (const it of list) {
      expect(it.item_type).toBe('原材料');
    }

    console.log(`[5.1] 宁国原材料筛选: ${list.length} 条 ✓`);
  });

  test('5.2 按物料类型筛选(成品)+广州工厂隔离', async () => {
    const res = await facGet(`/shelf-life-report?page=1&limit=100&item_type=${encodeURIComponent('成品')}&search=${TAG}`, FACTORY_G_ID);
    const body = await res.json();
    const list = items(body);

    const batchNos = list.map((i: any) => i.batch_number);
    expect(batchNos).toContain(BN_G_WARNING);
    expect(batchNos).toContain(BN_G_NORMAL);
    expect(batchNos).not.toContain(BN_G_EXPIRED); // 广州的原材料已到期不应出现
    expect(batchNos).not.toContain(BN_N_NORMAL);   // 宁国

    for (const it of list) {
      expect(it.item_type).toBe('成品');
    }

    console.log(`[5.2] 广州成品筛选: ${list.length} 条 ✓`);
  });

  test('5.3 按到期状态筛选(已到期)+宁国工厂隔离', async () => {
    const res = await facGet(`/shelf-life-report?page=1&limit=100&expire_status=${encodeURIComponent('已到期')}&search=${TAG}`, FACTORY_N_ID);
    const body = await res.json();
    const list = items(body);

    const batchNos = list.map((i: any) => i.batch_number);
    expect(batchNos).toContain(BN_N_EXPIRED);
    expect(batchNos).not.toContain(BN_G_EXPIRED); // 广州已到期不应出现

    for (const it of list) {
      expect(it.expire_status).toBe('已到期');
    }

    console.log(`[5.3] 宁国已到期筛选: ${list.length} 条 ✓`);
  });

  test('5.4 按到期状态筛选(即将到期)+广州工厂隔离', async () => {
    const res = await facGet(`/shelf-life-report?page=1&limit=100&expire_status=${encodeURIComponent('即将到期')}&search=${TAG}`, FACTORY_G_ID);
    const body = await res.json();
    const list = items(body);

    const batchNos = list.map((i: any) => i.batch_number);
    expect(batchNos).toContain(BN_G_WARNING);
    expect(batchNos).not.toContain(BN_N_WARNING); // 宁国即将到期不应出现

    for (const it of list) {
      expect(it.expire_status).toBe('即将到期');
    }

    console.log(`[5.4] 广州即将到期筛选: ${list.length} 条 ✓`);
  });

  // ========== 六、factory_name / factory_short 返回验证 ==========

  test('6.1 宁国批次返回 factory_short=宁国', async () => {
    const res = await facGet(`/shelf-life-report?page=1&limit=100&search=${TAG}`, FACTORY_N_ID);
    const body = await res.json();
    const list = items(body);

    for (const it of list) {
      expect(it.factory_short, '宁国批次 factory_short 应=宁国').toBe('宁国');
    }

    console.log(`[6.1] 宁国批次 factory_short 验证 ✓`);
  });

  test('6.2 广州批次返回 factory_short=广州', async () => {
    const res = await facGet(`/shelf-life-report?page=1&limit=100&search=${TAG}`, FACTORY_G_ID);
    const body = await res.json();
    const list = items(body);

    for (const it of list) {
      expect(it.factory_short, '广州批次 factory_short 应=广州').toBe('广州');
    }

    console.log(`[6.2] 广州批次 factory_short 验证 ✓`);
  });

  // ========== 七、全链路 factory_id 传递一致性 ==========

  test('7.1 有效期全链路 factory_id 一致性（DB直查）', async () => {
    const checks: Array<{ table: string; batch: string; fid: number }> = [];

    // material_batch_inventory
    for (const bn of [BN_N_EXPIRED, BN_N_WARNING]) {
      const rows = await query<any>(
        `SELECT factory_id FROM material_batch_inventory WHERE batch_number = @bn`,
        { bn: { type: T.NVarChar, value: bn } }
      );
      checks.push({ table: 'material_batch_inventory', batch: bn, fid: rows[0]?.factory_id });
      expect(rows[0]?.factory_id).toBe(FACTORY_N_ID);
    }
    for (const bn of [BN_G_EXPIRED]) {
      const rows = await query<any>(
        `SELECT factory_id FROM material_batch_inventory WHERE batch_number = @bn`,
        { bn: { type: T.NVarChar, value: bn } }
      );
      checks.push({ table: 'material_batch_inventory', batch: bn, fid: rows[0]?.factory_id });
      expect(rows[0]?.factory_id).toBe(FACTORY_G_ID);
    }

    // finished_batch_inventory
    for (const bn of [BN_N_NORMAL]) {
      const rows = await query<any>(
        `SELECT factory_id FROM finished_batch_inventory WHERE batch_number = @bn`,
        { bn: { type: T.NVarChar, value: bn } }
      );
      checks.push({ table: 'finished_batch_inventory', batch: bn, fid: rows[0]?.factory_id });
      expect(rows[0]?.factory_id).toBe(FACTORY_N_ID);
    }
    for (const bn of [BN_G_WARNING, BN_G_NORMAL]) {
      const rows = await query<any>(
        `SELECT factory_id FROM finished_batch_inventory WHERE batch_number = @bn`,
        { bn: { type: T.NVarChar, value: bn } }
      );
      checks.push({ table: 'finished_batch_inventory', batch: bn, fid: rows[0]?.factory_id });
      expect(rows[0]?.factory_id).toBe(FACTORY_G_ID);
    }

    console.log(`[7.1] 全链路 factory_id 一致性:`);
    for (const c of checks) console.log(`  ${c.table}(${c.batch}) → factory_id=${c.fid}`);
  });

  // ========== 九、清理 ==========

  test('9.1 清理测试数据', async () => {
    await cleanupTestData();
    await disposeApiContext();
    console.log('[9.1] 清理完成 ✓');
  });
});
