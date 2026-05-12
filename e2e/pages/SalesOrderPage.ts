/**
 * SalesOrderPage - 封装销售订单页面交互
 */
import { Page, expect } from '@playwright/test';

export interface SalesOrderCreateInput {
  customer_number: string;
  head_of_sales?: string;
  linkman?: string;
  contacts?: string;
  customer_po_number?: string;
  remark?: string;
  details: Array<{
    item_number: string;
    order_quantity: number;
    unit_price: number;
    delivery_date?: string;
    remark?: string;
  }>;
}

export class SalesOrderPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/sales-orders');
    await this.page.waitForLoadState('networkidle');
    // 等待销售订单表格渲染（新建按钮可见）
    await expect(this.page.getByRole('button', { name: /新建/ })).toBeVisible({ timeout: 15_000 });
  }

  async openCreateModal() {
    await this.page.getByRole('button', { name: /新建/ }).first().click();
    await expect(this.page.getByRole('dialog', { name: '新建销售订单' })).toBeVisible();
  }

  /** 选择客户: 在客户编号下拉框搜索+选择 */
  async selectCustomer(customerNumber: string) {
    const dialog = this.page.getByRole('dialog', { name: '新建销售订单' });
    // Ant Design Select 需要先点击展开
    const customerSelect = dialog.locator('.ant-form-item').filter({ hasText: '客户编号' }).locator('.ant-select').first();
    await customerSelect.click();
    // 输入搜索关键字
    await this.page.keyboard.type(customerNumber, { delay: 80 });
    // 等待后端搜索返回 + 选项渲染
    await this.page.waitForTimeout(1200);
    // 按文本内容匹配选项（labelFormat: "AH001 - 客户名"）
    const option = this.page.locator('.ant-select-item-option').filter({ hasText: customerNumber }).first();
    await option.waitFor({ state: 'visible', timeout: 8_000 });
    await option.click();
    // 等待客户名称自动回填
    await this.page.waitForTimeout(800);
  }

  async fillHeader(data: SalesOrderCreateInput) {
    const dialog = this.page.getByRole('dialog', { name: '新建销售订单' });
    if (data.head_of_sales !== undefined) {
      await dialog.locator('.ant-form-item').filter({ hasText: '销售负责人' }).locator('input').fill(data.head_of_sales);
    }
    if (data.linkman !== undefined) {
      await dialog.locator('.ant-form-item').filter({ hasText: '联系人' }).locator('input').fill(data.linkman);
    }
    if (data.contacts !== undefined) {
      await dialog.locator('.ant-form-item').filter({ hasText: '联系方式' }).locator('input').fill(data.contacts);
    }
    if (data.customer_po_number !== undefined) {
      await dialog.locator('.ant-form-item').filter({ hasText: '客户采购订单号' }).locator('input').fill(data.customer_po_number);
    }
    if (data.remark !== undefined) {
      await dialog.locator('.ant-form-item').filter({ hasText: '备注' }).locator('input').fill(data.remark);
    }
  }

  /** 添加明细行 */
  async addDetailRow() {
    const dialog = this.page.getByRole('dialog', { name: '新建销售订单' });
    await dialog.getByRole('button', { name: /添加产品行/ }).click();
    await this.page.waitForTimeout(300);
  }

  async fillDetailRow(rowIndex: number, detail: { item_number: string; order_quantity: number; unit_price: number; delivery_date?: string; remark?: string }) {
    const dialog = this.page.getByRole('dialog', { name: '新建销售订单' });
    const table = dialog.locator('.ant-table-tbody');
    const row = table.locator('tr.ant-table-row').nth(rowIndex);

    // 产品编号: AutoComplete, 输入文本后按选项
    const itemInput = row.locator('input').nth(0);
    await itemInput.click();
    await itemInput.fill(detail.item_number);
    // 等待下拉项
    await this.page.waitForTimeout(800);
    const option = this.page.locator(`.ant-select-item-option`).filter({ hasText: detail.item_number }).first();
    if (await option.count() > 0) {
      await option.click();
    } else {
      // 没有下拉项就直接按Enter
      await itemInput.press('Enter');
    }
    await this.page.waitForTimeout(500);

    // 数量
    const qtyInput = row.locator('input[role="spinbutton"]').nth(0);
    await qtyInput.click();
    await qtyInput.fill(String(detail.order_quantity));

    // 单价
    const priceInput = row.locator('input[role="spinbutton"]').nth(1);
    await priceInput.click();
    await priceInput.fill(String(detail.unit_price));

    // 明细交货日期 (普通input, YYYY-MM-DD)
    if (detail.delivery_date) {
      const dateInput = row.locator('input[placeholder="YYYY-MM-DD"]');
      if (await dateInput.count() > 0) {
        await dateInput.fill(detail.delivery_date);
      }
    }
  }

  async submit() {
    const dialog = this.page.getByRole('dialog', { name: '新建销售订单' });
    // Ant Design Modal footer 的 primary 按钮就是确定
    await dialog.locator('.ant-modal-footer button.ant-btn-primary').click();
    // 等待弹窗关闭
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  }

  /** 完整新建流程 */
  async createSalesOrder(input: SalesOrderCreateInput) {
    await this.openCreateModal();
    await this.selectCustomer(input.customer_number);
    await this.fillHeader(input);

    for (let i = 0; i < input.details.length; i++) {
      await this.addDetailRow();
      await this.fillDetailRow(i, input.details[i]);
    }

    await this.submit();
  }
}
