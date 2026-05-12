/**
 * MPSPage - MPS 主计划页面交互封装
 * 路由：/mps-report
 */
import { Page, expect } from '@playwright/test';

export class MPSPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/mps-report');
    await this.page.waitForLoadState('networkidle');
    await expect(this.page.getByRole('button', { name: /计算\s*MPS/ })).toBeVisible({ timeout: 15_000 });
  }

  /** 按客户筛选 */
  async selectCustomer(customerNumber: string) {
    // MPS 筛选区的客户 Select（placeholder 为“客户 (可选)”）
    // 筛选区是顶部第一个 a-card
    const filterCard = this.page.locator('.ant-card').first();
    const customerSelect = filterCard.locator('.ant-select').first();
    await customerSelect.click();
    await this.page.keyboard.type(customerNumber, { delay: 80 });
    await this.page.waitForTimeout(1200);
    const option = this.page.locator('.ant-select-item-option').filter({ hasText: customerNumber }).first();
    await option.waitFor({ state: 'visible', timeout: 8_000 });
    await option.click();
    await this.page.waitForTimeout(500);
  }

  /** 点击「计算 MPS」按钮 */
  async calculate() {
    await this.page.getByRole('button', { name: /计算\s*MPS/ }).click();
    // 等待计算完成消息或表格渲染
    await this.page.waitForTimeout(2000);
    // 等待结果表格中出现至少一行数据（或至少不再 loading）
    await this.page.waitForSelector('.ant-table-tbody tr.ant-table-row, .ant-empty', { timeout: 20_000 });
  }

  /** 选中指定物料行（radio 单选） */
  async selectItemRow(itemNumber: string) {
    // 找到包含 itemNumber 的行
    const row = this.page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: itemNumber }).first();
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    // 点击行内的 radio
    const radio = row.locator('input[type="radio"]');
    await radio.click({ force: true });
    await this.page.waitForTimeout(300);
  }

  /** 点「导入生产计划」并在确认对话框中确认 */
  async importToPlan() {
    await this.page.getByRole('button', { name: /导入生产计划/ }).click();
    // Modal.confirm 确认框（title: "确认导入生产计划"）
    const confirmDialog = this.page.locator('.ant-modal-confirm').filter({ hasText: '确认导入生产计划' });
    await confirmDialog.waitFor({ state: 'visible', timeout: 8_000 });
    // 确认按钮（okText="确认"）
    await confirmDialog.locator('button.ant-btn-primary').click();
    // 等待成功提示
    await this.page.waitForTimeout(2500);
  }
}
