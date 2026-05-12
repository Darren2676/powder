/**
 * 销售订单新建全流程 E2E 测试
 * 
 * 测试场景:
 *   1. 登录系统
 *   2. 导航到销售订单页
 *   3. 点击"新建"打开弹窗
 *   4. 选择客户(自动回填客户名称)
 *   5. 填写订单头(销售负责人、联系人、客户PO、备注)
 *   6. 添加产品明细(产品编号、数量、单价、交货日期)
 *   7. 提交
 *   8. 数据库验证: 订单头/明细数据落库正确
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { SalesOrderPage, SalesOrderCreateInput } from '../pages/SalesOrderPage';
import { getLatestSalesOrder, getSalesOrderDetails, cleanupTestOrders } from '../helpers/db.helper';

const TEST_MARKER = `E2E-TEST-${Date.now()}`;

const TEST_DATA: SalesOrderCreateInput = {
  customer_number: 'AH001',
  head_of_sales: 'E2E测试员',
  linkman: '测试联系人',
  contacts: '13800138000',
  customer_po_number: `PO-E2E-${Date.now()}`,
  remark: TEST_MARKER,
  details: [
    {
      item_number: 'C100809',
      order_quantity: 500,
      unit_price: 1.23,
      delivery_date: '2026-06-15',
    },
  ],
};

test.describe('销售订单新建全流程', () => {
  test.beforeAll(async () => {
    // 清理上次遗留的同类测试订单（安全：只删带测试标记的）
    await cleanupTestOrders(TEST_MARKER);
  });

  test('创建销售订单 + 数据库校验', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const salesOrderPage = new SalesOrderPage(page);

    // === Step 1: 登录 ===
    await test.step('1. 登录系统', async () => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin123');
      await expect(page).not.toHaveURL(/\/login/);
    });

    // === Step 2: 进入销售订单页 ===
    await test.step('2. 导航到销售订单列表', async () => {
      await salesOrderPage.goto();
      await page.screenshot({ path: 'reports/screenshots/01-sales-order-list.png', fullPage: true });
    });

    // === Step 3-6: 完整填写并提交 ===
    await test.step('3. 填写订单头+明细并提交', async () => {
      await salesOrderPage.openCreateModal();
      await page.screenshot({ path: 'reports/screenshots/02-create-modal-opened.png', fullPage: true });

      await salesOrderPage.selectCustomer(TEST_DATA.customer_number);
      await page.screenshot({ path: 'reports/screenshots/03-customer-selected.png', fullPage: true });

      await salesOrderPage.fillHeader(TEST_DATA);

      for (let i = 0; i < TEST_DATA.details.length; i++) {
        await salesOrderPage.addDetailRow();
        await salesOrderPage.fillDetailRow(i, TEST_DATA.details[i]);
      }
      await page.screenshot({ path: 'reports/screenshots/04-form-filled.png', fullPage: true });

      await salesOrderPage.submit();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'reports/screenshots/05-after-submit.png', fullPage: true });
    });

    // === Step 7: 数据库校验 ===
    await test.step('4. 数据库校验订单头数据', async () => {
      const order = await getLatestSalesOrder(TEST_DATA.customer_number);
      console.log('[DB断言] 最新订单:', JSON.stringify(order));

      expect(order, '数据库未查到新订单').toBeTruthy();
      expect(order.customer_number).toBe(TEST_DATA.customer_number);
      expect(order.customer_name).toBe('宁国睿信');  // 客户名称应自动带入
      expect(order.head_of_sales).toBe(TEST_DATA.head_of_sales);
      expect(order.linkman).toBe(TEST_DATA.linkman);
      expect(order.contacts).toBe(TEST_DATA.contacts);
      expect(order.remark).toBe(TEST_MARKER);
      expect(order.approval_status).toBe('草稿');  // 新建默认草稿
      expect(order.order_status).toBe('待执行');

      // 把订单号放到 env 供下一步复用
      process.env.__E2E_SON = order.sales_order_number;
      console.log('[DB断言] ✅ 订单头字段全部匹配, 订单号:', order.sales_order_number);
    });

    await test.step('5. 数据库校验订单明细', async () => {
      const son = process.env.__E2E_SON!;
      const details = await getSalesOrderDetails(son);
      console.log(`[DB断言] ${son} 明细行数:`, details.length);
      details.forEach((d) => console.log('[DB断言] 明细:', JSON.stringify(d)));

      expect(details.length).toBe(TEST_DATA.details.length);

      const d = details[0];
      const expected = TEST_DATA.details[0];
      expect(d.item_number).toBe(expected.item_number);
      expect(Number(d.order_quantity)).toBe(expected.order_quantity);
      expect(Number(d.unit_price)).toBeCloseTo(expected.unit_price, 2);
      // total_amount = qty * price
      expect(Number(d.total_amount)).toBeCloseTo(expected.order_quantity * expected.unit_price, 2);
      expect(d.status).toBe('未开始');
      expect(d.shipping_status).toBe('未申请');
      expect(d.production_status).toBe('未加入计划');

      console.log('[DB断言] ✅ 订单明细字段全部匹配');
    });
  });

  test.afterAll(async () => {
    // 清理本次测试产生的订单，保持数据库整洁
    const n = await cleanupTestOrders(TEST_MARKER);
    console.log(`[Cleanup] 删除测试订单 ${n} 条`);
  });
});
