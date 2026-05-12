/**
 * PackingOrderPage - 装箱管理页面交互（最小化，仅用于UI导航验证）
 */
import { Page, expect } from '@playwright/test';

export class PackingOrderPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/fg-packing-orders');
    await this.page.waitForLoadState('networkidle');
    // 等待表格渲染完成（可能为空列表，但 .ant-table 应存在）
    await this.page.waitForSelector('.ant-table', { timeout: 15_000 });
  }

  async verifyListLoaded() {
    await expect(this.page.locator('.ant-table')).toBeVisible();
  }
}
