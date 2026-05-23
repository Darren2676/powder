/**
 * LoginPage - 封装登录页交互
 */
import { Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(username: string, password: string) {
    // 等待页面加载
    await this.page.waitForLoadState('networkidle');
    // 输入用户名/密码 - 用 placeholder 定位
    await this.page.getByPlaceholder('请输入用户名').fill(username);
    await this.page.getByPlaceholder('请输入密码').fill(password);
    // Ant Design 按钮文本会插入空白 span，用 locator+hasText 或 type=submit 更稳
    await this.page.locator('button[type="submit"]').click();
    // 登录成功后跳转到首页，侧边菜单出现
    await this.page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 30_000 });
  }
}
