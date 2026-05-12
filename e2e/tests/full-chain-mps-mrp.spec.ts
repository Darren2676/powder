/**
 * 全链路 E2E 测试：销售订单 → 审批 → MPS → 生产计划 → 审批 → MRP → 执行 → 生产单+采购申请
 *
 * 混合模式：
 *   - UI: 新建销售订单（展示）、MPS 计算+导入（展示）、MRP 运算+执行（展示）
 *   - API: 销售订单审批、生产计划审批（稳定）
 *   - DB:  每一阶段落库断言
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { SalesOrderPage, SalesOrderCreateInput } from '../pages/SalesOrderPage';
import { MPSPage } from '../pages/MPSPage';
import { MRPPage } from '../pages/MRPPage';
import {
  getLatestSalesOrder,
  getLatestProductionPlan,
  getMrpRun,
  getMrpRunDetails,
  getProductionOrdersBySourcePlan,
  getPurchaseReqsBySourcePlan,
  cleanupFullChainByMarker,
  cleanupFullChainByContext,
  cleanupResidualMPSPlansByItem,
  cleanupResidualTestSalesOrders,
} from '../helpers/db.helper';
import { submitAndApprove, disposeApiContext } from '../helpers/api.helper';

const TEST_MARKER = `E2E-CHAIN-${Date.now()}`;
const SCREENSHOT_DIR = 'reports/screenshots-chain';

const TEST_DATA: SalesOrderCreateInput = {
  customer_number: 'AH001',
  head_of_sales: 'E2E测试员',
  linkman: '测试联系人',
  contacts: '13800138000',
  customer_po_number: `PO-CHAIN-${Date.now()}`,
  remark: TEST_MARKER,
  details: [
    {
      item_number: 'C100809',
      order_quantity: 99999, // 超大数量确保 MPS 净需求>0（当前库存 8900）
      unit_price: 1.23,
      delivery_date: '2026-06-15',
    },
  ],
};

// module 级 ctx，afterAll 可访问
const ctx: {
  sales_order_number?: string;
  production_number?: string;
  mrp_run_number?: string;
} = {};

test.describe('MPS→MRP 全链路 E2E', () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    // 1. 清理上次可能遗留的同 marker 全链路数据
    const r1 = await cleanupFullChainByMarker(TEST_MARKER);
    console.log('[beforeAll] marker 清理:', r1);

    // 2. 清理目标物料的残留 MPS 计划（以及派生的 MRP/生产单/采购申请）
    const r2 = await cleanupResidualMPSPlansByItem(TEST_DATA.details[0].item_number);
    console.log('[beforeAll] 残留 MPS 计划清理:', r2);

    // 3. 清理目标客户历史测试订单（remark 前缀 E2E-CHAIN-）
    const r3 = await cleanupResidualTestSalesOrders(TEST_DATA.customer_number, 'E2E-CHAIN-');
    console.log('[beforeAll] 历史测试售单清理:', r3);
  });

  test('SO → 审批 → MPS → 计划审批 → MRP → 执行', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const salesOrderPage = new SalesOrderPage(page);
    const mpsPage = new MPSPage(page);
    const mrpPage = new MRPPage(page);

    // ========== Step 1: 登录 ==========
    await test.step('1. 登录系统', async () => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin123');
      await expect(page).not.toHaveURL(/\/login/);
    });

    // ========== Step 2: UI 新建销售订单 ==========
    await test.step('2. UI 新建销售订单', async () => {
      await salesOrderPage.goto();
      await salesOrderPage.createSalesOrder(TEST_DATA);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/01-sales-order-created.png`, fullPage: true });

      const order = await getLatestSalesOrder(TEST_DATA.customer_number);
      expect(order, '未查到刚创建的销售订单').toBeTruthy();
      expect(order.remark).toBe(TEST_MARKER);
      expect(order.approval_status).toBe('草稿');
      ctx.sales_order_number = order.sales_order_number;
      console.log(`[Step2] ✅ 销售订单创建: ${ctx.sales_order_number}`);
    });

    // ========== Step 3: API 审批销售订单 ==========
    await test.step('3. API 审批销售订单', async () => {
      await submitAndApprove('sales_order', ctx.sales_order_number!);
      const order = await getLatestSalesOrder(TEST_DATA.customer_number);
      expect(order.approval_status).toBe('已审批');
      console.log(`[Step3] ✅ 销售订单已审批: ${ctx.sales_order_number}`);
    });

    // ========== Step 4: UI 打开 MPS 页面，计算 ==========
    await test.step('4. UI 计算 MPS', async () => {
      await mpsPage.goto();
      await mpsPage.selectCustomer(TEST_DATA.customer_number);
      await mpsPage.calculate();
      await page.screenshot({ path: `${SCREENSHOT_DIR}/02-mps-calculated.png`, fullPage: true });
      console.log('[Step4] ✅ MPS 计算完成');
    });

    // ========== Step 5: UI 导入生产计划 ==========
    await test.step('5. UI 选中物料并导入生产计划', async () => {
      await mpsPage.selectItemRow(TEST_DATA.details[0].item_number);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/03-mps-item-selected.png`, fullPage: true });

      await mpsPage.importToPlan();
      await page.screenshot({ path: `${SCREENSHOT_DIR}/04-mps-imported.png`, fullPage: true });

      // DB 断言：应生成一条生产计划
      const plan = await getLatestProductionPlan(
        TEST_DATA.details[0].item_number,
        ctx.sales_order_number!
      );
      expect(plan, '未查到生产计划').toBeTruthy();
      expect(plan.approval_status).toBe('草稿');
      ctx.production_number = plan.production_number;
      console.log(`[Step5] ✅ 生产计划生成: ${ctx.production_number}, 数量=${plan.planned_quantity}`);
    });

    // ========== Step 6: API 审批生产计划 ==========
    await test.step('6. API 审批生产计划', async () => {
      await submitAndApprove('Production_plan', ctx.production_number!);
      console.log(`[Step6] ✅ 生产计划已审批: ${ctx.production_number}`);
    });

    // ========== Step 7: UI 打开 MRP 页面，运行计算 ==========
    await test.step('7. UI 运行 MRP 计算', async () => {
      await mpsPage.goto; // 占位，防 TS 未用
      await mrpPage.goto();
      await mrpPage.searchPlan(ctx.production_number!);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/05-mrp-plan-list.png`, fullPage: true });

      await mrpPage.selectPlan(ctx.production_number!);
      await mrpPage.runMrp();
      await page.screenshot({ path: `${SCREENSHOT_DIR}/06-mrp-calculated.png`, fullPage: true });

      ctx.mrp_run_number = await mrpPage.getMrpRunNumber();
      console.log(`[Step7] ✅ MRP 计算完成: ${ctx.mrp_run_number}`);

      const run = await getMrpRun(ctx.mrp_run_number);
      expect(run, '未查到 mrp_run').toBeTruthy();
      expect(run.run_status).toBe('已计算');

      const details = await getMrpRunDetails(ctx.mrp_run_number);
      expect(details.length).toBeGreaterThan(0);
      console.log(`[Step7] MRP 结果明细行数: ${details.length}`);
    });

    // ========== Step 8: UI 确认执行 MRP ==========
    await test.step('8. UI 确认执行 MRP，生成生产单+采购申请', async () => {
      await mrpPage.executeMrp();
      await page.screenshot({ path: `${SCREENSHOT_DIR}/07-mrp-executed.png`, fullPage: true });

      // DB 断言：应生成至少一张生产单或采购申请
      const prodOrders = await getProductionOrdersBySourcePlan(ctx.production_number!);
      const purchaseReqs = await getPurchaseReqsBySourcePlan(ctx.production_number!);
      console.log(`[Step8] 生产单数: ${prodOrders.length}, 采购申请数: ${purchaseReqs.length}`);

      prodOrders.forEach((p) =>
        console.log(`[Step8] 生产单: ${p.production_order_number} item=${p.item_number} qty=${p.planned_quantity}`)
      );
      purchaseReqs.forEach((pr) =>
        console.log(`[Step8] 采购申请: ${pr.purchase_req_number} status=${pr.approval_status}`)
      );

      // 至少必须有生产单或采购申请中的一项
      expect(prodOrders.length + purchaseReqs.length, '既无生产单也无采购申请').toBeGreaterThan(0);

      // 校验 mrp_run 状态变为已确认
      const run = await getMrpRun(ctx.mrp_run_number!);
      expect(run.run_status).toBe('已确认');
      console.log(`[Step8] ✅ MRP 执行完成，状态=${run.run_status}`);
    });

    // ========== Summary ==========
    console.log('\n==================== 全链路执行结果 ====================');
    console.log(`销售订单: ${ctx.sales_order_number}`);
    console.log(`生产计划: ${ctx.production_number}`);
    console.log(`MRP运算: ${ctx.mrp_run_number}`);
    console.log('=======================================================\n');
  });

  test.afterAll(async () => {
    // 优先用精确 ctx 清理；兜底再按 marker 清一次（防止某步失败 ctx 缺失）
    if (ctx.sales_order_number || ctx.production_number) {
      const r1 = await cleanupFullChainByContext({
        salesOrderNumber: ctx.sales_order_number,
        productionNumber: ctx.production_number,
      });
      console.log('[afterAll] 精确清理:', r1);
    }
    const r2 = await cleanupFullChainByMarker(TEST_MARKER);
    console.log('[afterAll] marker 兜底清理:', r2);
    await disposeApiContext();
  });
});
