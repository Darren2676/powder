/**
 * MRPPage - MRP 运算页面交互封装
 * 路由：/mrp
 */
import { Page, expect } from '@playwright/test';

export class MRPPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/mrp');
    await this.page.waitForLoadState('networkidle');
    await expect(this.page.getByRole('button', { name: /运行\s*MRP\s*计算/ })).toBeVisible({ timeout: 15_000 });
  }

  /** 搜索计划列表（按计划编号或物料） */
  async searchPlan(keyword: string) {
    const input = this.page.getByPlaceholder('搜索计划编号/物料编号/名称');
    await input.fill(keyword);
    await this.page.getByRole('button', { name: /查询/ }).click();
    await this.page.waitForTimeout(1500);
  }

  /** 选中指定计划编号 */
  async selectPlan(productionNumber: string) {
    const row = this.page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: productionNumber }).first();
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    const checkbox = row.locator('input[type="checkbox"]');
    await checkbox.click({ force: true });
    await this.page.waitForTimeout(300);
  }

  /** 点「运行 MRP 计算」 */
  async runMrp() {
    await this.page.getByRole('button', { name: /运行\s*MRP\s*计算/ }).click();
    // MRP 计算完成后会显示结果卡片（标签含 MRP 计算结果）
    await this.page.waitForSelector('.ant-card:has-text("MRP 计算结果")', { timeout: 30_000 });
    await this.page.waitForTimeout(1500);
  }

  /** 从 MRP 结果卡片中提取 mrp_run_number */
  async getMrpRunNumber(): Promise<string> {
    // 页面在 card 头部用 a-tag 显示 mrp_run_number
    const tag = this.page.locator('.ant-card-head .ant-tag').first();
    const text = await tag.textContent();
    if (!text) throw new Error('未能读取 mrp_run_number');
    return text.trim();
  }

  /** 点「确认执行」 */
  async executeMrp() {
    await this.page.getByRole('button', { name: /确认执行/ }).click();
    // 可能弹出双源决策 Modal 或直接弹出 Modal.confirm
    // 先看是否出现双源决策弹窗
    const dualModal = this.page.locator('.ant-modal').filter({ hasText: '双源物料分配决策' });
    if (await dualModal.isVisible({ timeout: 1500 }).catch(() => false)) {
      // 点弹窗的「确认并执行」
      await dualModal.locator('.ant-modal-footer button.ant-btn-primary').click();
    }
    // 然后 Modal.confirm 的「确认执行MRP」
    const confirm = this.page.locator('.ant-modal-confirm').filter({ hasText: '确认执行MRP' });
    await confirm.waitFor({ state: 'visible', timeout: 8_000 });
    await confirm.locator('button.ant-btn-primary').click();
    // 等待执行完成（成功消息）
    await this.page.waitForTimeout(3000);
  }
}
