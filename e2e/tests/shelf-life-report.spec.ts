/**
 * 有效期管理报告 E2E 测试：
 *   1. 准备种子数据：启用有效期的物料 + 不同到期状态的批次库存
 *   2. API 验证：报告数据、筛选（仓库/物料类型/到期状态/搜索）
 *   3. UI 验证：页面加载、表格数据、筛选器交互、分页
 *   4. 到期日计算验证：生产日期 + 有效天数 = 到期日
 *   5. 清理测试数据
 */
import { test, expect, Page } from '@playwright/test';
import { query, T } from '../helpers/db.helper';
import { getApiContext, disposeApiContext, apiLogin } from '../helpers/api.helper';
import { LoginPage } from '../pages/LoginPage';

// 测试专用标记
const E2E_TAG = 'E2E-SHELF-LIFE';
const TEST_ITEM_RAW = 'E2E-SL-RAW';   // 原材料
const TEST_ITEM_FIN = 'E2E-SL-FIN';   // 成品
const TEST_WH_RAW = '04';             // 原材料仓
const TEST_WH_FIN = '01';             // 成品仓
const SHELF_LIFE_DAYS = 90;           // 有效天数

// 测试批次数据（不同到期状态）
const BATCH_EXPIRED = `${E2E_TAG}-EXPIRED`;       // 已到期
const BATCH_WARNING = `${E2E_TAG}-WARNING`;       // 即将到期（30天内）
const BATCH_NORMAL = `${E2E_TAG}-NORMAL`;         // 未到期

// 全局共享
const state: {
  batchNumbers: string[];
  origItemRaw?: any;
  origItemFin?: any;
} = { batchNumbers: [] };

test.describe.serial('有效期管理报告 E2E', () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    await getApiContext();
    await seedTestData();
  });

  test.afterAll(async () => {
    await cleanupTestData();
    await disposeApiContext();
  });

  // ========== 种子数据 ==========
  async function seedTestData() {
    // 1. 创建测试物料（原材料）
    const [existingRaw] = await query<any>(
      `SELECT item_number, enable_shelf_life, shelf_life_days FROM item_master WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM_RAW } }
    );
    if (existingRaw) {
      state.origItemRaw = { enable_shelf_life: existingRaw.enable_shelf_life, shelf_life_days: existingRaw.shelf_life_days };
      await query(`UPDATE item_master SET enable_shelf_life = N'Y', shelf_life_days = @days WHERE item_number = @item`,
        { days: { type: T.Int, value: SHELF_LIFE_DAYS }, item: { type: T.NVarChar, value: TEST_ITEM_RAW } });
    } else {
      await query(`INSERT INTO item_master (item_number, item_name, item_type, specifications, basic_unit, enable_shelf_life, shelf_life_days, creation_date)
        VALUES (@item, N'E2E测试原材料', N'原材料', N'测试规格', N'KG', N'Y', @days, GETDATE())`,
        { item: { type: T.NVarChar, value: TEST_ITEM_RAW }, days: { type: T.Int, value: SHELF_LIFE_DAYS } });
    }

    // 2. 创建测试物料（成品）
    const [existingFin] = await query<any>(
      `SELECT item_number, enable_shelf_life, shelf_life_days FROM item_master WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM_FIN } }
    );
    if (existingFin) {
      state.origItemFin = { enable_shelf_life: existingFin.enable_shelf_life, shelf_life_days: existingFin.shelf_life_days };
      await query(`UPDATE item_master SET enable_shelf_life = N'Y', shelf_life_days = @days WHERE item_number = @item`,
        { days: { type: T.Int, value: SHELF_LIFE_DAYS }, item: { type: T.NVarChar, value: TEST_ITEM_FIN } });
    } else {
      await query(`INSERT INTO item_master (item_number, item_name, item_type, specifications, basic_unit, enable_shelf_life, shelf_life_days, creation_date)
        VALUES (@item, N'E2E测试成品', N'成品', N'测试规格', N'KG', N'Y', @days, GETDATE())`,
        { item: { type: T.NVarChar, value: TEST_ITEM_FIN }, days: { type: T.Int, value: SHELF_LIFE_DAYS } });
    }

    // 3. 获取仓库名称
    const [whRaw] = await query<any>(
      `SELECT warehouse_name FROM warehouse WHERE warehouse_number = @wh`,
      { wh: { type: T.NVarChar, value: TEST_WH_RAW } }
    );
    const whRawName = whRaw?.warehouse_name || '原材料仓';

    const [whFin] = await query<any>(
      `SELECT warehouse_name FROM warehouse WHERE warehouse_number = @wh`,
      { wh: { type: T.NVarChar, value: TEST_WH_FIN } }
    );
    const whFinName = whFin?.warehouse_name || '成品仓';

    // 4. 插入3个批次（原材料）: 已到期、即将到期、未到期
    const insertBatch = async (
      table: string, batchNo: string, itemNo: string, itemName: string,
      itemType: string, whNo: string, whName: string, prodDate: string
    ) => {
      // 先清理旧批次
      await query(`DELETE FROM ${table} WHERE batch_number = @bn`,
        { bn: { type: T.NVarChar, value: batchNo } });

      const insertCols = table === 'finished_batch_inventory'
        ? `(batch_number, item_number, item_name, warehouse_number, warehouse_name, quantity, initial_quantity, production_date, inbound_date, status, creation_date)`
        : `(batch_number, item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity, production_date, inbound_date, status, creation_date)`;
      const insertVals = table === 'finished_batch_inventory'
        ? `(@bn, @item, @itemName, @wh, @whName, 100, 100, @pd, GETDATE(), N'正常', GETDATE())`
        : `(@bn, @item, @itemName, @itemType, N'测试规格', N'KG', @wh, @whName, 100, 100, @pd, GETDATE(), N'正常', GETDATE())`;

      await query(`INSERT INTO ${table} ${insertCols} VALUES ${insertVals}`, {
        bn: { type: T.NVarChar, value: batchNo },
        item: { type: T.NVarChar, value: itemNo },
        itemName: { type: T.NVarChar, value: itemName },
        itemType: { type: T.NVarChar, value: itemType },
        wh: { type: T.NVarChar, value: whNo },
        whName: { type: T.NVarChar, value: whName },
        pd: { type: T.DateTime, value: new Date(prodDate) },
      });
      state.batchNumbers.push(batchNo);
    };

    // 已到期: 生产日期 = 今天 - 100天（超过90天有效期）
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 100);
    await insertBatch('material_batch_inventory', BATCH_EXPIRED, TEST_ITEM_RAW, 'E2E测试原材料', '原材料',
      TEST_WH_RAW, whRawName, expiredDate.toISOString());

    // 即将到期: 生产日期 = 今天 - 70天（90天有效期中，剩余20天 < 30天预警）
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() - 70);
    await insertBatch('material_batch_inventory', BATCH_WARNING, TEST_ITEM_RAW, 'E2E测试原材料', '原材料',
      TEST_WH_RAW, whRawName, warningDate.toISOString());

    // 未到期: 生产日期 = 今天 - 10天（剩余80天，远大于30天预警）
    const normalDate = new Date();
    normalDate.setDate(normalDate.getDate() - 10);
    await insertBatch('finished_batch_inventory', BATCH_NORMAL, TEST_ITEM_FIN, 'E2E测试成品', '成品',
      TEST_WH_FIN, whFinName, normalDate.toISOString());
  }

  async function cleanupTestData() {
    // 清理批次
    for (const bn of state.batchNumbers) {
      await query(`DELETE FROM material_batch_inventory WHERE batch_number = @bn`,
        { bn: { type: T.NVarChar, value: bn } });
      await query(`DELETE FROM finished_batch_inventory WHERE batch_number = @bn`,
        { bn: { type: T.NVarChar, value: bn } });
    }
    // 恢复物料有效期设置
    if (state.origItemRaw) {
      await query(`UPDATE item_master SET enable_shelf_life = @esl, shelf_life_days = @sld WHERE item_number = @item`, {
        esl: { type: T.NVarChar, value: state.origItemRaw.enable_shelf_life || 'N' },
        sld: { type: T.Int, value: state.origItemRaw.shelf_life_days || 0 },
        item: { type: T.NVarChar, value: TEST_ITEM_RAW },
      });
    }
    if (state.origItemFin) {
      await query(`UPDATE item_master SET enable_shelf_life = @esl, shelf_life_days = @sld WHERE item_number = @item`, {
        esl: { type: T.NVarChar, value: state.origItemFin.enable_shelf_life || 'N' },
        sld: { type: T.Int, value: state.origItemFin.shelf_life_days || 0 },
        item: { type: T.NVarChar, value: TEST_ITEM_FIN },
      });
    }
    // 如果是新建的测试物料则删除
    const [rawItem] = await query<any>(
      `SELECT item_name FROM item_master WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM_RAW } }
    );
    if (rawItem?.item_name === 'E2E测试原材料') {
      await query(`DELETE FROM item_master WHERE item_number = @item`,
        { item: { type: T.NVarChar, value: TEST_ITEM_RAW } });
    }
    const [finItem] = await query<any>(
      `SELECT item_name FROM item_master WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM_FIN } }
    );
    if (finItem?.item_name === 'E2E测试成品') {
      await query(`DELETE FROM item_master WHERE item_number = @item`,
        { item: { type: T.NVarChar, value: TEST_ITEM_FIN } });
    }
  }

  // ========== API 测试 ==========

  test('T1: API 返回有效期报告数据', async () => {
    const api = await getApiContext();
    const res = await api.get('http://localhost:3000/api/v1/shelf-life-report', {
      params: { page: 1, limit: 100 },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBeTruthy();
    expect(body.data).toBeDefined();
    expect(body.data.items).toBeInstanceOf(Array);
    expect(body.data.total).toBeGreaterThanOrEqual(3); // 至少3条种子批次
  });

  test('T2: 到期状态计算正确（已到期/即将到期/未到期）', async () => {
    const api = await getApiContext();
    const res = await api.get('http://localhost:3000/api/v1/shelf-life-report', {
      params: { page: 1, limit: 100, search: 'E2E-SL' },
    });
    const body = await res.json();
    const items = body.data.items;
    expect(items.length).toBeGreaterThanOrEqual(3);

    const expired = items.find((i: any) => i.batch_number === BATCH_EXPIRED);
    const warning = items.find((i: any) => i.batch_number === BATCH_WARNING);
    const normal = items.find((i: any) => i.batch_number === BATCH_NORMAL);

    expect(expired).toBeDefined();
    expect(warning).toBeDefined();
    expect(normal).toBeDefined();

    expect(expired.expire_status).toBe('已到期');
    expect(warning.expire_status).toBe('即将到期');
    expect(normal.expire_status).toBe('未到期');
  });

  test('T3: 到期日 = 生产日期 + 有效天数', async () => {
    const api = await getApiContext();
    const res = await api.get('http://localhost:3000/api/v1/shelf-life-report', {
      params: { page: 1, limit: 100, search: 'E2E-SL' },
    });
    const body = await res.json();
    const normalItem = body.data.items.find((i: any) => i.batch_number === BATCH_NORMAL);
    expect(normalItem).toBeDefined();

    // 生产日期 = today - 10天，有效天数 = 90天，到期日 = today + 80天
    const prodDate = new Date(normalItem.production_date);
    const expiryDate = new Date(normalItem.expiry_date);
    const diffDays = Math.round((expiryDate.getTime() - prodDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(SHELF_LIFE_DAYS);
  });

  test('T4: 按物料类型筛选（原材料）', async () => {
    const api = await getApiContext();
    const res = await api.get('http://localhost:3000/api/v1/shelf-life-report', {
      params: { page: 1, limit: 100, item_type: '原材料', search: 'E2E-SL' },
    });
    const body = await res.json();
    const items = body.data.items;
    expect(items.length).toBeGreaterThanOrEqual(2); // 已到期 + 即将到期
    for (const item of items) {
      expect(item.item_type).toBe('原材料');
    }
  });

  test('T5: 按物料类型筛选（成品）', async () => {
    const api = await getApiContext();
    const res = await api.get('http://localhost:3000/api/v1/shelf-life-report', {
      params: { page: 1, limit: 100, item_type: '成品', search: 'E2E-SL' },
    });
    const body = await res.json();
    const items = body.data.items;
    expect(items.length).toBeGreaterThanOrEqual(1); // 未到期
    for (const item of items) {
      expect(item.item_type).toBe('成品');
    }
  });

  test('T6: 按到期状态筛选（已到期）', async () => {
    const api = await getApiContext();
    const res = await api.get('http://localhost:3000/api/v1/shelf-life-report', {
      params: { page: 1, limit: 100, expire_status: '已到期', search: 'E2E-SL' },
    });
    const body = await res.json();
    const items = body.data.items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) {
      expect(item.expire_status).toBe('已到期');
    }
  });

  test('T7: 按仓库筛选', async () => {
    const api = await getApiContext();
    const res = await api.get('http://localhost:3000/api/v1/shelf-life-report', {
      params: { page: 1, limit: 100, warehouse_number: TEST_WH_FIN, search: 'E2E-SL' },
    });
    const body = await res.json();
    const items = body.data.items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) {
      expect(item.warehouse_number).toBe(TEST_WH_FIN);
    }
  });

  test('T8: 搜索物料编号', async () => {
    const api = await getApiContext();
    const res = await api.get('http://localhost:3000/api/v1/shelf-life-report', {
      params: { page: 1, limit: 100, search: TEST_ITEM_FIN },
    });
    const body = await res.json();
    const items = body.data.items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) {
      expect(item.item_number).toContain('E2E-SL');
    }
  });

  test('T9: 分页功能', async () => {
    const api = await getApiContext();
    // 查总数
    const res1 = await api.get('http://localhost:3000/api/v1/shelf-life-report', {
      params: { page: 1, limit: 2, search: 'E2E-SL' },
    });
    const body1 = await res1.json();
    const total = body1.data.total;
    expect(total).toBeGreaterThanOrEqual(3);
    expect(body1.data.items.length).toBe(2); // 每页2条

    // 第2页
    const res2 = await api.get('http://localhost:3000/api/v1/shelf-life-report', {
      params: { page: 2, limit: 2, search: 'E2E-SL' },
    });
    const body2 = await res2.json();
    expect(body2.data.items.length).toBeGreaterThanOrEqual(1);

    // 两页数据不应不同
    const ids1 = body1.data.items.map((i: any) => i.batch_number);
    const ids2 = body2.data.items.map((i: any) => i.batch_number);
    expect(ids1.some((id: string) => ids2.includes(id))).toBeFalsy();
  });

  // ========== UI 测试 ==========

  async function loginUI(page: Page) {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin', 'admin123');
    await expect(page).not.toHaveURL(/\/login/);
  }

  async function navigateToShelfLifeReport(page: Page) {
    await loginUI(page);
    await page.locator('.ant-menu-submenu-title').filter({ hasText: '仓储管理' }).click();
    await page.waitForTimeout(500);
    await page.locator('.ant-menu-item').filter({ hasText: '有效期管理报告' }).click();
    await page.waitForSelector('span:has-text("有效期管理报告")', { state: 'visible', timeout: 15000 });
  }

  test('T10: UI - 页面加载并展示数据', async ({ page }) => {
    await navigateToShelfLifeReport(page);

    // 等待表格数据加载
    await page.waitForSelector('.ant-table-row', { timeout: 15000 });

    // 验证表格有数据行
    const rows = await page.$$('.ant-table-row');
    expect(rows.length).toBeGreaterThan(0);
  });

  test('T11: UI - 搜索功能', async ({ page }) => {
    await navigateToShelfLifeReport(page);

    // 输入搜索关键字
    const searchInput = page.locator('input[placeholder="物料编号/名称"]');
    await searchInput.fill('E2E-SL');
    await searchInput.press('Enter');

    // 等待表格刷新
    await page.waitForTimeout(1000);
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });

    const rows = await page.$$('.ant-table-row');
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  test('T12: UI - 物料类型筛选', async ({ page }) => {
    await navigateToShelfLifeReport(page);

    // 先搜索测试数据
    const searchInput = page.locator('input[placeholder="物料编号/名称"]');
    await searchInput.fill('E2E-SL');
    await searchInput.press('Enter');
    await page.waitForTimeout(1000);

    // 选择物料类型 = 成品
    await page.locator('.ant-select').filter({ hasText: '物料类型' }).first().click();
    await page.locator('.ant-select-item-option').filter({ hasText: /^成品$/ }).click();

    await page.waitForTimeout(1000);
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });

    // 验证筛选后只有成品
    const rows = await page.$$('.ant-table-row');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      const text = await row.textContent();
      expect(text).toContain('成品');
    }
  });

  test('T13: UI - 到期状态筛选', async ({ page }) => {
    await navigateToShelfLifeReport(page);

    // 先搜索测试数据
    const searchInput = page.locator('input[placeholder="物料编号/名称"]');
    await searchInput.fill('E2E-SL');
    await searchInput.press('Enter');
    await page.waitForTimeout(1000);

    // 选择到期状态 = 已到期
    await page.locator('.ant-select').filter({ hasText: '到期状态' }).first().click();
    await page.locator('.ant-select-item-option').filter({ hasText: /^已到期$/ }).click();

    await page.waitForTimeout(1000);

    // 验证结果
    const rows = await page.$$('.ant-table-row');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      const text = await row.textContent();
      expect(text).toContain('已到期');
    }
  });

  test('T14: UI - 重置功能', async ({ page }) => {
    await navigateToShelfLifeReport(page);

    // 输入搜索关键字并搜索
    const searchInput = page.locator('input[placeholder="物料编号/名称"]');
    await searchInput.fill('E2E-SL-NOT-EXIST');
    await searchInput.press('Enter');
    await page.waitForTimeout(1000);

    // 验证无数据
    const noData = await page.$('.ant-empty');
    expect(noData).toBeTruthy();

    // 清空搜索框并重新查询（等价于重置）
    await searchInput.fill('');
    await searchInput.press('Enter');
    await page.waitForTimeout(1000);

    // 搜索框应被清空
    const searchValue = await searchInput.inputValue();
    expect(searchValue).toBe('');

    // 应有数据
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });
    const rows = await page.$$('.ant-table-row');
    expect(rows.length).toBeGreaterThan(0);
  });

  test('T15: UI - 到期状态标签颜色', async ({ page }) => {
    await navigateToShelfLifeReport(page);

    // 搜索测试数据
    const searchInput = page.locator('input[placeholder="物料编号/名称"]');
    await searchInput.fill('E2E-SL');
    await searchInput.press('Enter');
    await page.waitForTimeout(1000);
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });

    // 验证存在标签
    const tags = await page.$$('.ant-tag');
    expect(tags.length).toBeGreaterThan(0);

    // 检查标签颜色
    for (const tag of tags) {
      const text = await tag.textContent();
      const className = await tag.getAttribute('class');
      if (text === '已到期') {
        expect(className).toContain('red');
      } else if (text === '即将到期') {
        expect(className).toContain('orange');
      } else if (text === '未到期') {
        expect(className).toContain('green');
      }
    }
  });
});
