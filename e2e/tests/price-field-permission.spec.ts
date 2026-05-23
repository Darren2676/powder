/**
 * 价格金额字段权限 E2E 测试
 *
 * 测试场景:
 *   1. API层: 验证不同角色用户的字段权限数据正确
 *      - admin 拥有所有字段权限
 *      - manager 拥有所有字段权限
 *      - staff 无价格字段权限
 *      - 自定义角色可按需分配/移除字段权限
 *
 *   2. UI层: 验证前端列根据权限显示/隐藏
 *      - 销售价目表明细: 含税/未税单价、税率、最低价列
 *      - 计件单价明细: 合格品/次品单价列
 *      - 标准成本明细: 标准成本/实际成本列
 *
 * 前置条件:
 *   - 迁移090已执行（新字段权限已写入数据库）
 *   - 后端服务在 localhost:3000 运行
 *   - 前端服务在 localhost:5173 运行
 */
import { test, expect, Page } from '@playwright/test';
import {
  loginAs,
  getMyPermissions,
  createTestUser,
  createTestRole,
  assignUserRoles,
  addFieldPermissionsToRole,
  removeFieldPermissionsFromRole,
  deleteUser,
  deleteRole,
  findRoleId,
  findUserId,
} from '../helpers/permission.helper';
import { query, T } from '../helpers/db.helper';

// ==================== 测试常量 ====================

const TEST_ROLE_CODE = 'e2e_price_viewer';
const TEST_ROLE_NAME = 'E2E价格查看角色';
const TEST_USER = 'e2e_price_test';
const TEST_USER_DISPLAY = 'E2E价格权限测试';
const TEST_USER_PWD = 'Test@123';

// 三个模块的字段权限定义
const PRICE_MODULES = {
  'sales-prices': {
    name: '销售价目表',
    route: '/sales-prices',
    sensitiveFields: ['tax_inclusive_price', 'tax_exclusive_price', 'tax_rate', 'min_price_inclusive', 'min_price_exclusive'],
    detailTableSelector: '.ant-modal .ant-table',  // 弹窗内明细表
  },
  'piece-rate-prices': {
    name: '计件单价',
    route: '/piece-rate-prices',
    sensitiveFields: ['qualified_piece_rate', 'defective_piece_rate'],
    detailTableSelector: '.ant-modal .ant-table',
  },
  'standard-costs': {
    name: '标准成本',
    route: '/standard-costs',
    sensitiveFields: ['standard_cost', 'actual_cost'],
    detailTableSelector: '.ant-modal .ant-table',
  },
} as const;

type PageCode = keyof typeof PRICE_MODULES;

// ==================== 辅助函数 ====================

/** 等待页面表格加载完成 */
async function waitForTableLoad(page: Page) {
  await page.waitForSelector('.ant-table', { timeout: 30_000 });
  await page.waitForTimeout(500); // 等待数据渲染
}

/** 检查表格中是否存在指定列标题 */
async function hasColumnHeader(page: Page, tableSelector: string, columnTitle: string): Promise<boolean> {
  const headers = page.locator(`${tableSelector} .ant-table-thead th`);
  const count = await headers.count();
  for (let i = 0; i < count; i++) {
    const text = await headers.nth(i).innerText();
    if (text.includes(columnTitle)) return true;
  }
  return false;
}

/** 获取表格所有列标题 */
async function getTableColumnTitles(page: Page, tableSelector: string): Promise<string[]> {
  const headers = page.locator(`${tableSelector} .ant-table-thead th`);
  const count = await headers.count();
  const titles: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await headers.nth(i).innerText();
    titles.push(text.trim());
  }
  return titles;
}

// ==================== 测试套件 ====================

test.describe('价格金额字段权限控制', () => {

  // ---- API层测试 ----

  test.describe('API层: 字段权限数据验证', () => {

    test('admin用户拥有所有价格字段权限', async () => {
      const token = await loginAs('admin', 'admin123');
      const perms = await getMyPermissions(token);

      expect(perms.isAdmin).toBe(true);

      for (const [pageCode, config] of Object.entries(PRICE_MODULES)) {
        const fieldPerms = perms.fieldPermissions[pageCode] || [];
        for (const field of config.sensitiveFields) {
          expect(fieldPerms).toContain(field);
        }
      }
    });

    test('manager角色拥有所有价格字段权限', async () => {
      // 直接通过数据库验证角色-权限关联
      const managerRoleId = await findRoleId('manager');
      if (!managerRoleId) { test.skip(); return; }

      for (const [pageCode, config] of Object.entries(PRICE_MODULES)) {
        for (const field of config.sensitiveFields) {
          const permId = await query<any>(
            `SELECT p.id FROM permission p INNER JOIN role_permission rp ON rp.permission_id = p.id WHERE p.permission_code = @code AND rp.role_id = @rid`,
            { code: { type: T.NVarChar, value: `${pageCode}:field:${field}` }, rid: { type: T.Int, value: managerRoleId } }
          );
          expect(permId.length, `manager应拥有 ${pageCode}:field:${field}`).toBeGreaterThan(0);
        }
      }
    });

    test('staff角色无价格字段权限', async () => {
      // 直接通过数据库验证角色-权限关联
      const staffRoleId = await findRoleId('staff');
      if (!staffRoleId) { test.skip(); return; }

      for (const [pageCode, config] of Object.entries(PRICE_MODULES)) {
        for (const field of config.sensitiveFields) {
          const permId = await query<any>(
            `SELECT p.id FROM permission p INNER JOIN role_permission rp ON rp.permission_id = p.id WHERE p.permission_code = @code AND rp.role_id = @rid`,
            { code: { type: T.NVarChar, value: `${pageCode}:field:${field}` }, rid: { type: T.Int, value: staffRoleId } }
          );
          expect(permId.length, `staff不应拥有 ${pageCode}:field:${field}`).toBe(0);
        }
      }
    });

  });

  // ---- UI层测试（admin vs 受限用户） ----

  test.describe('UI层: 前端列显示/隐藏验证', () => {

    let testRoleId: number | null = null;
    let testUserId: number | null = null;

    test.beforeAll(async () => {
      // 创建测试角色（只有页面查看权限，无字段权限）
      testRoleId = await createTestRole(TEST_ROLE_CODE, TEST_ROLE_NAME);

      // 创建测试用户
      testUserId = await createTestUser(TEST_USER, TEST_USER_DISPLAY, TEST_USER_PWD);

      // 为测试用户分配测试角色
      if (testRoleId && testUserId) {
        await assignUserRoles(testUserId, [testRoleId]);
      }
    });

    test.afterAll(async () => {
      // 清理测试数据
      if (testUserId) {
        try { await deleteUser(testUserId); } catch { /* ignore */ }
      }
      if (testRoleId) {
        try { await deleteRole(testRoleId); } catch { /* ignore */ }
      }
    });

    /** 给测试角色添加页面访问权限（菜单级 + 查看操作级），使路由守卫放行 */
    async function grantPageAccess(pageCode: string) {
      if (!testRoleId) return;
      // 菜单/页面级权限（如 'sales-prices'）— 路由守卫检查 hasPermission(pageCode) || hasMenuKey(pageCode)
      const menuPermRows = await query<any>(
        `SELECT id FROM permission WHERE permission_code = @code AND permission_type IN (N'menu', N'page')`,
        { code: { type: T.NVarChar, value: pageCode } }
      );
      if (menuPermRows[0]) {
        const existing = await query<any>(
          `SELECT permission_id FROM role_permission WHERE role_id = @rid AND permission_id = @pid`,
          { rid: { type: T.Int, value: testRoleId }, pid: { type: T.Int, value: menuPermRows[0].id } }
        );
        if (existing.length === 0) {
          await query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (@rid, @pid)`,
            { rid: { type: T.Int, value: testRoleId }, pid: { type: T.Int, value: menuPermRows[0].id } }
          );
        }
      }
      // 查看操作级权限（如 'sales-prices:view'）— 页面内按钮/功能需要
      const viewPermRows = await query<any>(
        `SELECT id FROM permission WHERE permission_code = @code`,
        { code: { type: T.NVarChar, value: `${pageCode}:view` } }
      );
      if (viewPermRows[0]) {
        const existing = await query<any>(
          `SELECT permission_id FROM role_permission WHERE role_id = @rid AND permission_id = @pid`,
          { rid: { type: T.Int, value: testRoleId }, pid: { type: T.Int, value: viewPermRows[0].id } }
        );
        if (existing.length === 0) {
          await query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (@rid, @pid)`,
            { rid: { type: T.Int, value: testRoleId }, pid: { type: T.Int, value: viewPermRows[0].id } }
          );
        }
      }
    }

    /** 通过登录表单登录后通过 Vue Router 导航到目标页面 */
    async function loginAndNavigate(page: Page, username: string, password: string, targetRoute: string) {
      // 1. 通过登录表单登录
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      // 清除可能残留的旧 localStorage
      await page.evaluate(() => localStorage.clear());

      // 填写登录表单
      await page.getByPlaceholder('请输入用户名').fill(username);
      await page.getByPlaceholder('请输入密码').fill(password);
      await page.locator('button[type="submit"]').click();

      // 等待登录成功并跳转到首页
      await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 30_000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500); // 等待菜单树加载

      // 2. 通过 Vue Router 程序化导航（避免全页刷新触发 Ant Design Menu 崩溃）
      await page.evaluate((route) => {
        // @ts-ignore - 通过 Vue 实例访问 router
        const app = document.querySelector('#app').__vue_app__;
        if (app) {
          const router = app.config.globalProperties.$router;
          router.push(route);
        }
      }, targetRoute);

      // 3. 等待页面导航完成和表格加载
      await waitForTableLoad(page);
    }

    // --- 销售价目表 ---

    test('admin用户: 销售价目表明细显示价格列', async ({ page }) => {
      await loginAndNavigate(page, 'admin', 'admin123', PRICE_MODULES['sales-prices'].route);

      // 点击第一行的"查看"打开弹窗
      const actionBtn = page.locator('tr').first().locator('text=查看').first();
      if (await actionBtn.isVisible()) {
        await actionBtn.click();
        await page.waitForSelector('.ant-modal', { timeout: 10_000 });
        await page.waitForTimeout(1000);

        const titles = await getTableColumnTitles(page, PRICE_MODULES['sales-prices'].detailTableSelector);
        expect(titles.some(t => t.includes('含税单价'))).toBe(true);
        expect(titles.some(t => t.includes('未税单价'))).toBe(true);
        expect(titles.some(t => t.includes('税率'))).toBe(true);
        expect(titles.some(t => t.includes('含税最低价'))).toBe(true);
        expect(titles.some(t => t.includes('不含税最低价'))).toBe(true);

        await page.locator('.ant-modal-close').click();
      }
    });

    test('受限用户: 销售价目表明细隐藏价格列', async ({ page }) => {
      if (!testRoleId) { test.skip(); return; }

      // 给测试角色分配 sales-prices 菜单+查看权限（使路由守卫放行）
      await grantPageAccess('sales-prices');

      await loginAndNavigate(page, TEST_USER, TEST_USER_PWD, PRICE_MODULES['sales-prices'].route);

      const actionBtn = page.locator('tr').first().locator('text=查看').first();
      if (await actionBtn.isVisible()) {
        await actionBtn.click();
        await page.waitForSelector('.ant-modal', { timeout: 10_000 });
        await page.waitForTimeout(1000);

        const titles = await getTableColumnTitles(page, PRICE_MODULES['sales-prices'].detailTableSelector);
        expect(titles.some(t => t.includes('含税单价'))).toBe(false);
        expect(titles.some(t => t.includes('未税单价'))).toBe(false);
        expect(titles.some(t => t.includes('税率'))).toBe(false);
        expect(titles.some(t => t.includes('含税最低价'))).toBe(false);
        expect(titles.some(t => t.includes('不含税最低价'))).toBe(false);

        await page.locator('.ant-modal-close').click();
      }
    });

    // --- 计件单价 ---

    test('admin用户: 计件单价明细显示单价列', async ({ page }) => {
      await loginAndNavigate(page, 'admin', 'admin123', PRICE_MODULES['piece-rate-prices'].route);

      const actionBtn = page.locator('tr').first().locator('text=查看').first();
      if (await actionBtn.isVisible()) {
        await actionBtn.click();
        await page.waitForSelector('.ant-modal', { timeout: 10_000 });
        await page.waitForTimeout(1000);

        const titles = await getTableColumnTitles(page, PRICE_MODULES['piece-rate-prices'].detailTableSelector);
        expect(titles.some(t => t.includes('合格品单价'))).toBe(true);
        expect(titles.some(t => t.includes('次品单价'))).toBe(true);

        await page.locator('.ant-modal-close').click();
      }
    });

    test('受限用户: 计件单价明细隐藏单价列', async ({ page }) => {
      if (!testRoleId) { test.skip(); return; }

      // 给测试角色分配 piece-rate-prices 菜单+查看权限（使路由守卫放行）
      await grantPageAccess('piece-rate-prices');

      await loginAndNavigate(page, TEST_USER, TEST_USER_PWD, PRICE_MODULES['piece-rate-prices'].route);

      const actionBtn = page.locator('tr').first().locator('text=查看').first();
      if (await actionBtn.isVisible()) {
        await actionBtn.click();
        await page.waitForSelector('.ant-modal', { timeout: 10_000 });
        await page.waitForTimeout(1000);

        const titles = await getTableColumnTitles(page, PRICE_MODULES['piece-rate-prices'].detailTableSelector);
        expect(titles.some(t => t.includes('合格品单价'))).toBe(false);
        expect(titles.some(t => t.includes('次品单价'))).toBe(false);

        await page.locator('.ant-modal-close').click();
      }
    });

    // --- 标准成本 ---

    test('admin用户: 标准成本明细显示成本列', async ({ page }) => {
      await loginAndNavigate(page, 'admin', 'admin123', PRICE_MODULES['standard-costs'].route);

      // 标准成本用双页签，点击主表行跳到明细页签
      const firstRow = page.locator('.ant-table-tbody tr').first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForTimeout(1500);

        const detailTable = page.locator('.ant-tabs-content .ant-table').last();
        if (await detailTable.isVisible()) {
          const titles = await getTableColumnTitles(page, '.ant-tabs-content .ant-table');
          expect(titles.some(t => t.includes('标准成本单价'))).toBe(true);
          expect(titles.some(t => t.includes('实际成本'))).toBe(true);
        }
      }
    });

    test('受限用户: 标准成本明细隐藏成本列', async ({ page }) => {
      if (!testRoleId) { test.skip(); return; }

      // 给测试角色分配 standard-costs 菜单+查看权限（使路由守卫放行）
      await grantPageAccess('standard-costs');

      await loginAndNavigate(page, TEST_USER, TEST_USER_PWD, PRICE_MODULES['standard-costs'].route);

      const firstRow = page.locator('.ant-table-tbody tr').first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForTimeout(1500);

        const detailTable = page.locator('.ant-tabs-content .ant-table').last();
        if (await detailTable.isVisible()) {
          const titles = await getTableColumnTitles(page, '.ant-tabs-content .ant-table');
          expect(titles.some(t => t.includes('标准成本单价'))).toBe(false);
          expect(titles.some(t => t.includes('实际成本'))).toBe(false);
        }
      }
    });

  });

  // ---- 动态权限变更测试 ----

  test.describe('动态权限: 分配/移除字段权限后即时生效', () => {
    let testRoleId: number | null = null;
    let testUserId: number | null = null;

    test.beforeAll(async () => {
      testRoleId = await createTestRole('e2e_dynamic_perm', 'E2E动态权限测试');
      testUserId = await createTestUser('e2e_dynamic_user', 'E2E动态权限用户');
      if (testRoleId && testUserId) {
        await assignUserRoles(testUserId, [testRoleId]);
      }
    });

    test.afterAll(async () => {
      if (testUserId) {
        try { await deleteUser(testUserId); } catch { /* ignore */ }
      }
      if (testRoleId) {
        try { await deleteRole(testRoleId); } catch { /* ignore */ }
      }
    });

    test('分配字段权限后，API返回正确的字段权限', async () => {
      if (!testRoleId) { test.skip(); return; }

      // 给测试角色添加 sales-prices 的页面查看权限 + 字段权限
      await addFieldPermissionsToRole(testRoleId, 'sales-prices', ['tax_inclusive_price', 'tax_exclusive_price']);

      // 登录测试用户，验证API返回
      const token = await loginAs('e2e_dynamic_user', TEST_USER_PWD);
      const perms = await getMyPermissions(token);

      const fieldPerms = perms.fieldPermissions['sales-prices'] || [];
      expect(fieldPerms).toContain('tax_inclusive_price');
      expect(fieldPerms).toContain('tax_exclusive_price');
      // 未分配的字段不应出现
      expect(fieldPerms).not.toContain('tax_rate');
    });

    test('移除字段权限后，API不再返回该字段', async () => {
      if (!testRoleId) { test.skip(); return; }

      // 移除 tax_inclusive_price 字段权限
      await removeFieldPermissionsFromRole(testRoleId, 'sales-prices', ['tax_inclusive_price']);

      const token = await loginAs('e2e_dynamic_user', TEST_USER_PWD);
      const perms = await getMyPermissions(token);

      const fieldPerms = perms.fieldPermissions['sales-prices'] || [];
      expect(fieldPerms).not.toContain('tax_inclusive_price');
      // 之前分配的 tax_exclusive_price 应仍存在
      expect(fieldPerms).toContain('tax_exclusive_price');
    });

  });

  // ---- 数据库层验证 ----

  test.describe('数据库层: 迁移090字段权限记录验证', () => {

    test('销售价目表字段权限记录完整', async () => {
      const rows = await query<any>(
        `SELECT permission_code, permission_name, permission_type, status
         FROM permission
         WHERE permission_code LIKE 'sales-prices:field:%' AND permission_type = N'field'`
      );

      const codes = rows.map(r => r.permission_code);
      expect(codes).toContain('sales-prices:field:tax_inclusive_price');
      expect(codes).toContain('sales-prices:field:tax_exclusive_price');
      expect(codes).toContain('sales-prices:field:tax_rate');
      expect(codes).toContain('sales-prices:field:min_price_inclusive');
      expect(codes).toContain('sales-prices:field:min_price_exclusive');
      // 旧的字段权限应已被删除
      expect(codes).not.toContain('sales-prices:field:unit_price');
      expect(codes).not.toContain('sales-prices:field:price');

      // 所有权限应为启用状态
      for (const row of rows) {
        expect(row.status).toBe('启用');
      }
    });

    test('计件单价字段权限记录完整', async () => {
      const rows = await query<any>(
        `SELECT permission_code, permission_name FROM permission
         WHERE permission_code LIKE 'piece-rate-prices:field:%' AND permission_type = N'field'`
      );

      const codes = rows.map(r => r.permission_code);
      expect(codes).toContain('piece-rate-prices:field:qualified_piece_rate');
      expect(codes).toContain('piece-rate-prices:field:defective_piece_rate');
      expect(codes).not.toContain('piece-rate-prices:field:unit_price');
      expect(codes).not.toContain('piece-rate-prices:field:price');
    });

    test('标准成本字段权限记录完整', async () => {
      const rows = await query<any>(
        `SELECT permission_code, permission_name FROM permission
         WHERE permission_code LIKE 'standard-costs:field:%' AND permission_type = N'field'`
      );

      const codes = rows.map(r => r.permission_code);
      expect(codes).toContain('standard-costs:field:standard_cost');
      expect(codes).toContain('standard-costs:field:actual_cost');
      expect(codes).not.toContain('standard-costs:field:price');
    });

    test('admin角色拥有所有新字段权限', async () => {
      const adminRoleId = await findRoleId('admin');
      expect(adminRoleId).not.toBeNull();

      for (const [pageCode, config] of Object.entries(PRICE_MODULES)) {
        for (const field of config.sensitiveFields) {
          const permId = await query<any>(
            `SELECT p.id FROM permission p
             INNER JOIN role_permission rp ON rp.permission_id = p.id
             WHERE p.permission_code = @code AND rp.role_id = @rid`,
            { code: { type: T.NVarChar, value: `${pageCode}:field:${field}` }, rid: { type: T.Int, value: adminRoleId } }
          );
          expect(permId.length).toBeGreaterThan(0);
        }
      }
    });

    test('manager角色拥有所有新字段权限', async () => {
      const managerRoleId = await findRoleId('manager');
      if (!managerRoleId) { test.skip(); return; }

      for (const [pageCode, config] of Object.entries(PRICE_MODULES)) {
        for (const field of config.sensitiveFields) {
          const permId = await query<any>(
            `SELECT p.id FROM permission p
             INNER JOIN role_permission rp ON rp.permission_id = p.id
             WHERE p.permission_code = @code AND rp.role_id = @rid`,
            { code: { type: T.NVarChar, value: `${pageCode}:field:${field}` }, rid: { type: T.Int, value: managerRoleId } }
          );
          expect(permId.length).toBeGreaterThan(0);
        }
      }
    });

  });

});
