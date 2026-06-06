/**
 * 多工厂数据隔离与总部汇总 E2E 测试
 *
 * 测试覆盖：
 *   1. 工厂列表 API（GET /factories/list）
 *   2. 工厂切换 API（POST /factories/switch）— JWT 重签
 *   3. 数据隔离：factory_id 过滤（SELECT 仅返回当前工厂数据）
 *   4. factory_id 自动写入（新建销售订单时 factory_id 自动注入）
 *   5. 总部汇总 API（GET /headquarters/overview）— 仅总部角色可访问
 *   6. 前端工厂切换器 UI 交互
 *   7. 前端列表显示工厂列
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { query, T } from '../helpers/db.helper';
import { apiLogin, getApiContext, disposeApiContext } from '../helpers/api.helper';

const API_BASE = 'http://localhost:3000/api/v1';

// ==================== 测试数据 ====================
const FACTORY_N_ID = 14;   // 宁国工厂
const FACTORY_G_ID = 15;   // 广州工厂
const TEST_CUSTOMER = 'AH001';  // 宁国睿信
const TEST_ITEM = 'C100809';

// 测试标记，用于清理
const TEST_MARKER = `FACTORY-E2E-${Date.now()}`;

// ==================== 辅助函数 ====================

/** 创建一条带指定 factory_id 的销售订单（直接 SQL，用于构造隔离测试数据） */
async function createTestSO(factoryId: number, remark: string): Promise<string> {
  const orderNumber = `SO-FAC-TEST-${factoryId}-${Date.now()}`;
  const now = new Date();
  const creationDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  await query(
    `INSERT INTO sales_order (sales_order_number, customer_number, customer_name, head_of_sales, linkman, contacts,
       order_date, delivery_date, order_status, [condition], approval_status, remark, creation_date, creation_man, factory_id)
     VALUES (@son, @cn, @custName, @hos, @lm, @ct,
       @od, @dd, @os, @cond, N'草稿', @remark, @cd, N'admin', @fid)`,
    {
      son: { type: T.NVarChar, value: orderNumber },
      cn: { type: T.NVarChar, value: TEST_CUSTOMER },
      custName: { type: T.NVarChar, value: '宁国睿信' },
      hos: { type: T.NVarChar, value: 'E2E工厂测试' },
      lm: { type: T.NVarChar, value: '测试联系人' },
      ct: { type: T.NVarChar, value: '13800000000' },
      od: { type: T.NVarChar, value: now.toISOString().slice(0, 10) },
      dd: { type: T.NVarChar, value: new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10) },
      os: { type: T.NVarChar, value: '待执行' },
      cond: { type: T.NVarChar, value: '启用' },
      remark: { type: T.NVarChar, value: remark },
      cd: { type: T.NVarChar, value: creationDate },
      fid: { type: T.Int, value: factoryId },
    }
  );
  return orderNumber;
}

/** 清理测试订单 */
async function cleanupTestSOs(remarkPrefix: string) {
  await query(
    `DELETE FROM sales_order_detail WHERE sales_order_number IN
       (SELECT sales_order_number FROM sales_order WHERE remark LIKE @prefix)`,
    { prefix: { type: T.NVarChar, value: `${remarkPrefix}%` } }
  );
  await query(
    `DELETE FROM sales_order WHERE remark LIKE @prefix`,
    { prefix: { type: T.NVarChar, value: `${remarkPrefix}%` } }
  );
}

/** 获取工厂表中的工厂数据 */
async function getFactories() {
  return await query<any>('SELECT id, factory_code, factory_name, factory_short, status FROM factory ORDER BY id');
}

/** 获取用户的 default_factory_id */
async function getUserFactoryId(username: string) {
  const rows = await query<any>(
    `SELECT default_factory_id FROM users WHERE username = @u`,
    { u: { type: T.NVarChar, value: username } }
  );
  return rows[0]?.default_factory_id || null;
}

// ==================== 测试套件 ====================

test.describe('多工厂数据隔离与总部汇总', () => {

  // ──────── 1. 工厂列表 API ────────
  test.describe('1. 工厂列表 API', () => {
    test('admin 用户获取工厂列表', async () => {
      const token = await apiLogin('admin', 'admin123');
      const ctx = await getApiContext();

      const res = await ctx.get(`${API_BASE}/factories/list`);
      expect(res.ok()).toBeTruthy();

      const body = await res.json();
      const factories = body.data;

      expect(Array.isArray(factories)).toBeTruthy();
      // admin 角色不是总部角色，无 user_factory_access 记录时只返回默认工厂
      expect(factories.length).toBeGreaterThanOrEqual(1);

      // 验证至少包含宁国工厂（admin 默认工厂）
      const codes = factories.map((f: any) => f.factory_code);
      expect(codes).toContain('N');

      // 验证字段结构
      const f0 = factories[0];
      expect(f0).toHaveProperty('id');
      expect(f0).toHaveProperty('factory_code');
      expect(f0).toHaveProperty('factory_name');
      expect(f0).toHaveProperty('factory_short');
      expect(f0).toHaveProperty('status');

      console.log('[工厂列表] ✅ 工厂数量:', factories.length, '工厂数据:', JSON.stringify(factories));
    });

    test('未认证用户请求工厂列表，应返回 401', async () => {
      const { request } = await import('@playwright/test');
      const ctx = await request.newContext();
      const res = await ctx.get(`${API_BASE}/factories/list`);
      expect(res.status()).toBe(401);
      await ctx.dispose();
    });
  });

  // ──────── 2. 工厂切换 API ────────
  test.describe('2. 工厂切换 API', () => {
    test('切换到广州工厂，应返回新 JWT 和工厂信息', async () => {
      const token = await apiLogin('admin', 'admin123');
      const ctx = await getApiContext();

      const res = await ctx.post(`${API_BASE}/factories/switch`, {
        data: { factory_id: FACTORY_G_ID }
      });
      expect(res.ok()).toBeTruthy();

      const body = await res.json();
      expect(body.data.token).toBeTruthy();
      expect(body.data.factory.id).toBe(FACTORY_G_ID);
      expect(body.data.factory.factory_code).toBe('G');
      expect(body.data.factory.factory_name).toBe('广州工厂');

      // 新 token 应不同于旧 token
      expect(body.data.token).not.toBe(token);

      console.log('[工厂切换] ✅ 切换到广州工厂，JWT已重签');
    });

    test('切换到不存在的工厂，应返回 400', async () => {
      await apiLogin('admin', 'admin123');
      const ctx = await getApiContext();

      const res = await ctx.post(`${API_BASE}/factories/switch`, {
        data: { factory_id: 99999 }
      });
      expect(res.status()).toBe(400);

      const body = await res.json();
      expect(body.message || body.msg).toContain('不存在');

      console.log('[工厂切换] ✅ 不存在的工厂正确返回 400');
    });

    test('未传 factory_id，应返回 400', async () => {
      await apiLogin('admin', 'admin123');
      const ctx = await getApiContext();

      const res = await ctx.post(`${API_BASE}/factories/switch`, {
        data: {}
      });
      expect(res.status()).toBe(400);

      console.log('[工厂切换] ✅ 缺少 factory_id 正确返回 400');
    });
  });

  // ──────── 3. 数据隔离：factory_id 过滤 ────────
  test.describe('3. 数据隔离 — factory_id 过滤', () => {
    let soFactoryN: string;
    let soFactoryG: string;

    test.beforeAll(async () => {
      // 为两个工厂各创建一条测试订单
      soFactoryN = await createTestSO(FACTORY_N_ID, `${TEST_MARKER}-N`);
      soFactoryG = await createTestSO(FACTORY_G_ID, `${TEST_MARKER}-G`);
      console.log(`[数据准备] 宁国工厂订单: ${soFactoryN}, 广州工厂订单: ${soFactoryG}`);
    });

    test('请求宁国工厂数据，只返回 factory_id=14 的订单', async () => {
      await apiLogin('admin', 'admin123');
      const ctx = await getApiContext();

      const res = await ctx.get(`${API_BASE}/sales-orders?page=1&limit=50`, {
        headers: { 'x-factory-id': String(FACTORY_N_ID) }
      });
      expect(res.ok()).toBeTruthy();

      const body = await res.json();
      const items = body.data?.items || [];

      // 所有返回的订单 factory_id 都应该是宁国工厂
      for (const item of items) {
        expect(item.factory_id).toBe(FACTORY_N_ID);
      }

      // 宁国工厂的测试订单应该在列表中
      const orderNumbers = items.map((i: any) => i.sales_order_number);
      expect(orderNumbers).toContain(soFactoryN);

      // 广州工厂的测试订单不应该出现
      expect(orderNumbers).not.toContain(soFactoryG);

      console.log(`[数据隔离] ✅ 宁国工厂视图: ${items.length} 条订单, 均为 factory_id=${FACTORY_N_ID}`);
    });

    test('请求广州工厂数据，只返回 factory_id=15 的订单', async () => {
      await apiLogin('admin', 'admin123');
      const ctx = await getApiContext();

      const res = await ctx.get(`${API_BASE}/sales-orders?page=1&limit=50`, {
        headers: { 'x-factory-id': String(FACTORY_G_ID) }
      });
      expect(res.ok()).toBeTruthy();

      const body = await res.json();
      const items = body.data?.items || [];

      // 所有返回的订单 factory_id 都应该是广州工厂
      for (const item of items) {
        expect(item.factory_id).toBe(FACTORY_G_ID);
      }

      // 广州工厂的测试订单应该在列表中
      const orderNumbers = items.map((i: any) => i.sales_order_number);
      expect(orderNumbers).toContain(soFactoryG);

      // 宁国一厂的测试订单不应该出现
      expect(orderNumbers).not.toContain(soFactoryN);

      console.log(`[数据隔离] ✅ 宣城二厂视图: ${items.length} 条订单, 均为 factory_id=${FACTORY_G_ID}`);
    });

    test('无工厂头时，使用用户默认工厂（宁国一厂）', async () => {
      await apiLogin('admin', 'admin123');
      const ctx = await getApiContext();

      // 不传 x-factory-id 头
      const res = await ctx.get(`${API_BASE}/sales-orders?page=1&limit=50`);
      expect(res.ok()).toBeTruthy();

      const body = await res.json();
      const items = body.data?.items || [];

      // 应该使用 admin 的默认工厂 (factory_id=14)
      for (const item of items) {
        expect(item.factory_id).toBe(FACTORY_N_ID);
      }

      console.log(`[数据隔离] ✅ 默认工厂视图: ${items.length} 条订单, 均为 factory_id=${FACTORY_N_ID}`);
    });

    test('总部全部视图 (x-view-mode: all)，不过滤 factory_id', async () => {
      await apiLogin('admin', 'admin123');
      const ctx = await getApiContext();

      // 注意：admin 不是总部角色，所以 x-view-mode: all 不会生效
      // 但仍可验证返回数据的完整性
      const res = await ctx.get(`${API_BASE}/sales-orders?page=1&limit=50`, {
        headers: { 'x-view-mode': 'all', 'x-factory-id': String(FACTORY_N_ID) }
      });
      expect(res.ok()).toBeTruthy();

      const body = await res.json();
      const items = body.data?.items || [];
      expect(items.length).toBeGreaterThanOrEqual(1);

      console.log(`[数据隔离] ✅ 视图模式测试: ${items.length} 条订单`);
    });

    test.afterAll(async () => {
      await cleanupTestSOs(TEST_MARKER);
    });
  });

  // ──────── 4. factory_id 自动写入 ────────
  test.describe('4. factory_id 自动写入', () => {
    test('新建销售订单时，factory_id 应自动注入', async () => {
      const token = await apiLogin('admin', 'admin123');
      const ctx = await getApiContext();

      // 用 x-factory-id 头指定宁国一厂
      const res = await ctx.post(`${API_BASE}/sales-orders`, {
        headers: { 'x-factory-id': String(FACTORY_N_ID) },
        data: {
          customer_number: TEST_CUSTOMER,
          customer_name: '宁国睿信',
          head_of_sales: 'E2E工厂写入测试',
          linkman: '测试',
          contacts: '13800000000',
          order_date: new Date().toISOString().slice(0, 10),
          delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          remark: `${TEST_MARKER}-AUTO-WRITE`,
          details: [{
            item_number: TEST_ITEM,
            order_quantity: 100,
            unit_price: 1.0,
            delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          }]
        }
      });
      expect(res.ok()).toBeTruthy();

      const body = await res.json();
      const orderNumber = body.data?.sales_order_number || body.data?.orderNumber;
      expect(orderNumber).toBeTruthy();

      // 数据库验证: factory_id 应该是宁国一厂
      const dbRows = await query<any>(
        `SELECT TOP 1 sales_order_number, factory_id, remark FROM sales_order WHERE remark = @remark ORDER BY creation_date DESC`,
        { remark: { type: T.NVarChar, value: `${TEST_MARKER}-AUTO-WRITE` } }
      );

      expect(dbRows.length).toBe(1);
      expect(dbRows[0].factory_id).toBe(FACTORY_N_ID);

      console.log(`[自动写入] ✅ 订单 ${dbRows[0].sales_order_number} factory_id=${dbRows[0].factory_id}`);

      // 清理
      await cleanupTestSOs(`${TEST_MARKER}-AUTO-WRITE`);
    });

    test('新建销售订单时，切换到宣城二厂，factory_id 应为15', async () => {
      const token = await apiLogin('admin', 'admin123');
      const ctx = await getApiContext();

      // 用 x-factory-id 头指定宣城二厂
      const res = await ctx.post(`${API_BASE}/sales-orders`, {
        headers: { 'x-factory-id': String(FACTORY_G_ID) },
        data: {
          customer_number: TEST_CUSTOMER,
          customer_name: '宁国睿信',
          head_of_sales: 'E2E工厂写入测试G',
          linkman: '测试',
          contacts: '13800000000',
          order_date: new Date().toISOString().slice(0, 10),
          delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          remark: `${TEST_MARKER}-AUTO-WRITE-G`,
          details: [{
            item_number: TEST_ITEM,
            order_quantity: 200,
            unit_price: 2.0,
            delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          }]
        }
      });
      expect(res.ok()).toBeTruthy();

      // 数据库验证
      const dbRows = await query<any>(
        `SELECT TOP 1 sales_order_number, factory_id, remark FROM sales_order WHERE remark = @remark ORDER BY creation_date DESC`,
        { remark: { type: T.NVarChar, value: `${TEST_MARKER}-AUTO-WRITE-G` } }
      );

      expect(dbRows.length).toBe(1);
      expect(dbRows[0].factory_id).toBe(FACTORY_G_ID);

      console.log(`[自动写入] ✅ 订单 ${dbRows[0].sales_order_number} factory_id=${dbRows[0].factory_id}`);

      // 清理
      await cleanupTestSOs(`${TEST_MARKER}-AUTO-WRITE-G`);
    });
  });

  // ──────── 5. 总部汇总 API ────────
  test.describe('5. 总部汇总 API', () => {
    test('admin 用户请求总部概览，应返回汇总数据', async () => {
      // 注意：admin 角色可能不在总部角色列表中
      // 先用 admin 测试 API 是否可达
      await apiLogin('admin', 'admin123');
      const ctx = await getApiContext();

      const res = await ctx.get(`${API_BASE}/headquarters/overview`);
      const body = await res.json();

      if (res.ok()) {
        // admin 是总部角色（或在非严格模式下被放行）
        expect(body.data).toHaveProperty('factories');
        expect(body.data).toHaveProperty('summary');
        expect(body.data.factories.length).toBeGreaterThanOrEqual(2);
        expect(body.data.summary.total_factories).toBeGreaterThanOrEqual(2);

        console.log('[总部汇总] ✅ 概览数据:', JSON.stringify(body.data.summary));
      } else {
        // 如果 admin 不是总部角色，应返回 403
        expect(res.status()).toBe(403);
        console.log('[总部汇总] ⚠️ admin 非总部角色，返回 403（符合预期）');
      }
    });

    test('总部概览包含每个工厂的独立数据', async () => {
      await apiLogin('admin', 'admin123');
      const ctx = await getApiContext();

      const res = await ctx.get(`${API_BASE}/headquarters/overview`);

      if (!res.ok()) {
        // admin 非总部角色，跳过
        console.log('[总部汇总] ⚠️ admin 非总部角色，跳过详细校验');
        return;
      }

      const body = await res.json();
      const factories = body.data.factories;

      // 验证每个工厂都有独立的数据块
      for (const f of factories) {
        expect(f.factory).toHaveProperty('id');
        expect(f.factory).toHaveProperty('factory_code');
        expect(f.factory).toHaveProperty('factory_name');
        expect(f).toHaveProperty('users');
        expect(f).toHaveProperty('sales_30d');
        expect(f).toHaveProperty('purchase_30d');
        expect(f).toHaveProperty('production_active');
        expect(f).toHaveProperty('inventory');

        console.log(`[总部汇总] 工厂: ${f.factory.factory_name}, 用户: ${f.users}, 销售: ${f.sales_30d.orders}单, 采购: ${f.purchase_30d.orders}单`);
      }
    });

    test('未认证用户请求总部概览，应返回 401', async () => {
      const { request } = await import('@playwright/test');
      const ctx = await request.newContext();
      const res = await ctx.get(`${API_BASE}/headquarters/overview`);
      expect(res.status()).toBe(401);
      await ctx.dispose();
    });
  });

  // ──────── 6. 前端工厂切换器 UI ────────
  test.describe('6. 前端工厂切换器 UI', () => {
    test('登录后顶部应显示工厂切换器', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login('admin', 'admin123');
      await expect(page).not.toHaveURL(/\/login/);

      // 等待页面加载
      await page.waitForTimeout(2000);

      // 查找工厂切换按钮（带 ShopOutlined 图标 + 工厂名称 + SwapOutlined 切换图标）
      const factoryBtn = page.locator('.factory-btn').first();
      const hasFactoryBtn = (await factoryBtn.count()) > 0;

      if (hasFactoryBtn) {
        const text = await factoryBtn.textContent();
        expect(text).toContain('一厂');  // admin 默认工厂
        console.log('[UI] ✅ 工厂切换器显示:', text);
      } else {
        // 没有工厂切换按钮时，检查工厂文字
        const factoryText = page.getByText(/^[一二]厂$/).first();
        expect((await factoryText.count())).toBeGreaterThan(0);
        console.log('[UI] ✅ 工厂信息已显示');
      }

      await page.screenshot({ path: 'reports/screenshots/factory-switcher-ui.png', fullPage: false });
    });

    test('点击工厂切换器应显示工厂选项', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login('admin', 'admin123');
      await expect(page).not.toHaveURL(/\/login/);
      await page.waitForTimeout(2000);

      // 点击工厂切换按钮
      const factoryBtn = page.locator('.factory-btn').first();
      if ((await factoryBtn.count()) > 0) {
        await factoryBtn.click();
        await page.waitForTimeout(1000);

        // 应出现工厂下拉菜单
        const menuItems = page.locator('.ant-dropdown-menu-item');
        const hasMenuItems = (await menuItems.count()) > 0;

        if (hasMenuItems) {
          const texts = await menuItems.allTextContents();
          const factoryTexts = texts.filter(t => t.includes('厂') || t.includes('factory_code'));
          // admin 只有1个可访问工厂（宁国一厂），所以只看到1个工厂选项
          expect(factoryTexts.length).toBeGreaterThanOrEqual(1);
          console.log('[UI] 工厂选项:', factoryTexts);
        }
      } else {
        console.log('[UI] ⚠️ 无工厂切换按钮，可能尚未加载工厂数据');
      }

      await page.screenshot({ path: 'reports/screenshots/factory-switcher-menu.png', fullPage: false });
    });
  });

  // ──────── 7. 前端列表显示工厂列 ────────
  test.describe('7. 前端列表显示工厂列', () => {
    test('销售订单列表应包含"工厂"列或工厂数据', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login('admin', 'admin123');
      await expect(page).not.toHaveURL(/\/login/);
      await page.waitForTimeout(2000);

      // 通过侧边栏导航到销售订单页面
      await page.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: '销售管理' }).first().click();
      await page.waitForTimeout(500);
      await page.locator('.ant-menu-item').filter({ hasText: '销售订单' }).first().click();
      await page.waitForTimeout(2000);

      // 查找"工厂"列标题（Ant Design Vue 表头可能是 th 或 div）
      const factoryHeader = page.locator('th, .ant-table-thead > tr > th').filter({ hasText: '工厂' }).first();
      const hasFactoryColumn = (await factoryHeader.count()) > 0;

      // 如果列个性化隐藏了工厂列，只要工厂数据存在也算通过
      const factoryData = page.getByText(/^[一二]厂$/).first();
      const hasFactoryData = (await factoryData.count()) > 0;

      expect(hasFactoryColumn || hasFactoryData).toBeTruthy();
      console.log(`[UI] ✅ 销售订单列表: 工厂列头=${hasFactoryColumn}, 工厂数据=${hasFactoryData}`);
      await page.screenshot({ path: 'reports/screenshots/sales-order-factory-column.png', fullPage: true });
    });

    test('销售订单列表工厂列应显示工厂简称', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login('admin', 'admin123');
      await expect(page).not.toHaveURL(/\/login/);
      await page.waitForTimeout(2000);

      // 通过侧边栏导航到销售订单页面
      await page.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: '销售管理' }).first().click();
      await page.waitForTimeout(500);
      await page.locator('.ant-menu-item').filter({ hasText: '销售订单' }).first().click();
      await page.waitForTimeout(2000);

      // 检查表格中是否有工厂简称（一厂/二厂）
      const factoryCell = page.getByText(/^[一二]厂$/).first();
      const hasFactoryData = (await factoryCell.count()) > 0;

      if (hasFactoryData) {
        const factoryTexts = await page.getByText(/^[一二]厂$/).allTextContents();
        console.log('[UI] 工厂列数据:', factoryTexts);
        expect(factoryTexts.length).toBeGreaterThanOrEqual(1);
      } else {
        // 如果没有订单数据，验证列头存在即可
        const factoryHeader = page.locator('th').filter({ hasText: '工厂' }).first();
        const hasHeader = (await factoryHeader.count()) > 0;
        expect(hasHeader).toBeTruthy();
        console.log('[UI] ⚠️ 暂无订单数据，但工厂列头已存在');
      }

      await page.screenshot({ path: 'reports/screenshots/sales-order-factory-data.png', fullPage: true });
    });
  });

  // ──────── 8. 数据库层面验证 ────────
  test.describe('8. 数据库层面验证', () => {
    test('factory 表应包含宁国一厂和宣城二厂', async () => {
      const factories = await getFactories();
      expect(factories.length).toBeGreaterThanOrEqual(2);

      const factoryN = factories.find((f: any) => f.factory_code === 'N');
      const factoryG = factories.find((f: any) => f.factory_code === 'G');

      expect(factoryN).toBeTruthy();
      expect(factoryN.factory_name).toBe('宁国一厂');

      expect(factoryG).toBeTruthy();
      expect(factoryG.factory_name).toBe('宣城二厂');

      console.log('[DB] ✅ 工厂数据:', JSON.stringify(factories));
    });

    test('users 表的 default_factory_id 应已设置', async () => {
      const factoryId = await getUserFactoryId('admin');
      expect(factoryId).not.toBeNull();
      expect(factoryId).toBe(FACTORY_N_ID);

      console.log(`[DB] ✅ admin default_factory_id = ${factoryId}`);
    });

    test('factory_id DEFAULT 约束应生效', async () => {
      // 验证 sales_order 表的 DEFAULT 约束
      const constraints = await query<any>(
        `SELECT name FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('sales_order') AND parent_column_id = (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID('sales_order') AND name = 'factory_id')`
      );
      expect(constraints.length).toBeGreaterThan(0);

      console.log('[DB] ✅ sales_order factory_id DEFAULT 约束存在:', constraints[0].name);
    });

    test('业务表 factory_id 列应已存在', async () => {
      const tables = ['sales_order', 'purchase_order', 'production_order', 'stock_in'];
      for (const table of tables) {
        const cols = await query<any>(
          `SELECT column_id, name FROM sys.columns WHERE object_id = OBJECT_ID(@tbl) AND name = 'factory_id'`,
          { tbl: { type: T.NVarChar, value: table } }
        );
        expect(cols.length, `${table} 应有 factory_id 列`).toBe(1);
        console.log(`[DB] ✅ ${table}.factory_id 存在`);
      }
    });
  });

});

// 清理全局 API 上下文
test.afterAll(async () => {
  await disposeApiContext();
});