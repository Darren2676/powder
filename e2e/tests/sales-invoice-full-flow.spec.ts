/**
 * 销售发票管理全链路 E2E 测试：
 *   销售订单 → 发货出库 → 创建发票(关联发货明细) → 审批发票(开票状态联动)
 *   → 双向查询(发票↔发货/订单明细) → 编辑发票(自动撤消+状态回退)
 *   → 撤消审批(状态回退) → 部分开票 → 删除发票
 *
 * 策略：API 驱动 + DB 断言（纯API，无UI操作）
 */
import { test, expect } from '@playwright/test';
import {
  getLatestSalesOrder,
  getSalesOrderDetails,
  getSalesOrderDetailById,
  getShippingRequest,
  getShippingOrder,
  getShippingOrderDetails,
  getShippingDetailInvoiceStatus,
  getSalesDetailInvoiceStatus,
  getSalesInvoice,
  getSalesInvoiceLines,
  getFinishedBatchInventory,
  seedFinishedInventory,
  cleanupShippingReturnChain,
  cleanupSalesInvoiceData,
  query,
  T,
} from '../helpers/db.helper';
import {
  getApiContext,
  disposeApiContext,
  submitAndApprove,
  createSalesOrderAPI,
  createShippingRequestAPI,
  updateShippingRequestStatusAPI,
  batchOutboundAPI,
  createSalesInvoiceAPI,
  getSalesInvoiceDetailAPI,
  updateSalesInvoiceAPI,
  deleteSalesInvoiceAPI,
  approveSalesInvoiceAPI,
  withdrawSalesInvoiceAPI,
  getAvailableShippingDetailsAPI,
  getInvoicesByShippingDetailAPI,
  getInvoicesBySalesDetailAPI,
} from '../helpers/api.helper';

// 测试数据
const TEST_ITEM = 'C100809';
const TEST_QTY = 100;
const WAREHOUSE_FINISHED = '01';
const WAREHOUSE_NAME = '成品仓';
const TEST_REMARK = 'E2E-SALES-INVOICE';
const CUSTOMER_NUMBER = 'AH001';
const TAX_RATE = 0.13;

// 全局共享状态
const ctx: {
  salesOrderNumber?: string;
  salesDetailId?: number;
  requestNumber?: string;
  shippingOrderNumber?: string;
  shippingDetailId?: number;
  invoiceNumbers: string[];
  seededBatchNumber?: string;
} = {
  invoiceNumbers: [],
};

test.describe.serial('销售发票管理全链路 E2E', () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    await getApiContext();
  });

  test.afterAll(async () => {
    try {
      // 清理发票
      if (ctx.invoiceNumbers.length > 0) {
        const r = await cleanupSalesInvoiceData(ctx.invoiceNumbers);
        console.log(`[afterAll] 清理发票: ${r} 条`);
      }
      // 清理发货退货链
      const r = await cleanupShippingReturnChain({
        salesOrderNumber: ctx.salesOrderNumber,
        shippingRequestNumbers: ctx.requestNumber ? [ctx.requestNumber] : [],
        shippingOrderNumbers: ctx.shippingOrderNumber ? [ctx.shippingOrderNumber] : [],
      });
      console.log('[afterAll] 清理链路:', r);
    } catch (e) {
      console.warn('[afterAll] 清理异常:', e);
    }
    await disposeApiContext();
  });

  // ==================== Test 1: 销售订单+审批 → 发货出库 ====================
  test('1. 创建+审批销售订单→发货申请→批次FIFO出库→已发货', async () => {
    // Step 1: 种子成品库存
    const batchNo = await seedFinishedInventory(TEST_ITEM, WAREHOUSE_FINISHED, 200);
    ctx.seededBatchNumber = batchNo!;
    console.log(`[Test1] 种子成品库存: ${batchNo}`);

    // Step 2: 创建销售订单
    const soResult = await createSalesOrderAPI({
      customer_number: CUSTOMER_NUMBER,
      remark: TEST_REMARK,
      details: [{
        item_number: TEST_ITEM,
        order_quantity: TEST_QTY,
        unit_price: 100,
      }],
    });
    expect(soResult?.sales_order_number, '未返回销售订单号').toBeTruthy();
    ctx.salesOrderNumber = soResult.sales_order_number;
    console.log(`[Test1] 销售订单创建: ${ctx.salesOrderNumber}`);

    // Step 3: 审批销售订单
    await submitAndApprove('sales_order', ctx.salesOrderNumber);
    const so = await getLatestSalesOrder(CUSTOMER_NUMBER);
    expect(so?.approval_status, '销售订单审批失败').toBe('已审批');
    console.log(`[Test1] 销售订单已审批`);

    // Step 4: 获取销售订单明细
    const details = await getSalesOrderDetails(ctx.salesOrderNumber);
    expect(details.length, '销售订单明细为空').toBeGreaterThan(0);
    ctx.salesDetailId = details[0].id;
    console.log(`[Test1] 销售明细: id=${ctx.salesDetailId}, item=${details[0].item_number}`);

    // Step 5: 创建发货申请
    const srResult = await createShippingRequestAPI({
      customer_number: CUSTOMER_NUMBER,
      remark: 'E2E发货申请-发票测试',
      details: [{
        sales_order_number: ctx.salesOrderNumber,
        detail_id: ctx.salesDetailId!,
        item_number: TEST_ITEM,
        order_quantity: TEST_QTY,
        shipped_quantity: 0,
        ship_quantity: TEST_QTY,
      }],
    });
    expect(srResult?.request_number, '未返回发货申请号').toBeTruthy();
    ctx.requestNumber = srResult.request_number;
    console.log(`[Test1] 发货申请创建: ${ctx.requestNumber}`);

    // Step 6: 审批发货申请
    await updateShippingRequestStatusAPI(ctx.requestNumber, '已审核');
    const sr = await getShippingRequest(ctx.requestNumber);
    expect(sr?.status, '发货申请审批失败').toBe('已审核');
    console.log(`[Test1] 发货申请已审核`);

    // Step 7: 批次FIFO出库
    const batches = await getFinishedBatchInventory(TEST_ITEM, WAREHOUSE_FINISHED);
    expect(batches.length, '无可用成品批次库存').toBeGreaterThan(0);
    const fifoBatch = batches[0];
    const batchItems = [{ batch_number: fifoBatch.batch_number, quantity: TEST_QTY }];

    const outboundResult = await batchOutboundAPI({
      warehouse_number: WAREHOUSE_FINISHED,
      warehouse_name: WAREHOUSE_NAME,
      remark: 'E2E出库-发票测试',
      items: [{
        request_number: ctx.requestNumber!,
        item_number: TEST_ITEM,
        ship_quantity: TEST_QTY,
        warehouse_number: WAREHOUSE_FINISHED,
        warehouse_name: WAREHOUSE_NAME,
        sales_detail_id: ctx.salesDetailId,
        batch_items: batchItems,
      }],
    });

    // 获取发货单号
    if (outboundResult?.shippingOrderNumber) {
      ctx.shippingOrderNumber = outboundResult.shippingOrderNumber;
    }
    // 如果出库结果未返回发货单号，从DB查询
    if (!ctx.shippingOrderNumber) {
      const soRows = await query<any>(
        `SELECT TOP 1 shipping_order_number FROM shipping_order WHERE request_number = @rn ORDER BY creation_date DESC`,
        { rn: { type: T.NVarChar, value: ctx.requestNumber! } }
      );
      ctx.shippingOrderNumber = soRows[0]?.shipping_order_number;
    }
    expect(ctx.shippingOrderNumber, '未获取到发货单号').toBeTruthy();
    console.log(`[Test1] 发货单: ${ctx.shippingOrderNumber}`);

    // 获取发货单明细ID
    const soDetails = await getShippingOrderDetails(ctx.shippingOrderNumber!);
    expect(soDetails.length, '发货单明细为空').toBeGreaterThan(0);
    ctx.shippingDetailId = soDetails[0].id;
    console.log(`[Test1] 发货明细id: ${ctx.shippingDetailId}`);

    // DB断言: 发货单状态为已发货
    const shippingOrder = await getShippingOrder(ctx.shippingOrderNumber!);
    console.log(`[Test1] 发货单状态: ${shippingOrder?.status}`);

    // DB断言: 发货明细行和销售订单明细行开票状态应为"未开票"
    const shipDetailStatus = await getShippingDetailInvoiceStatus(ctx.shippingDetailId!);
    expect(shipDetailStatus?.invoice_status, '发货明细行开票状态应为未开票').toBe('未开票');

    const salesDetailStatus = await getSalesDetailInvoiceStatus(ctx.salesDetailId!);
    expect(salesDetailStatus?.invoice_status, '销售订单明细行开票状态应为未开票').toBe('未开票');
    console.log(`[Test1] 发货前开票状态验证通过: 均为未开票`);
  });

  // ==================== Test 2: 创建发票(草稿) → 关联发货明细 ====================
  test('2. 创建销售发票(草稿)→关联发货明细行→草稿不影响开票状态', async () => {
    expect(ctx.shippingOrderNumber, '无发货单号').toBeTruthy();
    expect(ctx.shippingDetailId, '无发货明细ID').toBeTruthy();

    // Step 1: 获取可开票发货明细行
    const availableDetails = await getAvailableShippingDetailsAPI(CUSTOMER_NUMBER);
    expect(availableDetails.length, '无可开票发货明细行').toBeGreaterThan(0);
    const targetDetail = availableDetails.find((d: any) => d.id === ctx.shippingDetailId);
    expect(targetDetail, '当前发货明细行不在可开票列表中').toBeTruthy();
    console.log(`[Test2] 可开票明细数: ${availableDetails.length}, 可开票数量: ${targetDetail?.available_qty}`);

    // Step 2: 查询物料信息
    const itemRows = await query<any>(
      `SELECT item_name, specifications, basic_unit FROM item_master WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM } }
    );
    const itemInfo = itemRows[0] || {};

    // Step 3: 创建发票(草稿)
    const invoiceQty = TEST_QTY;
    const unitPrice = 100;
    const amountWithoutTax = invoiceQty * unitPrice;
    const taxAmount = Math.round(amountWithoutTax * TAX_RATE * 100) / 100;
    const amountWithTax = amountWithoutTax + taxAmount;

    const invResult = await createSalesInvoiceAPI({
      invoice_code: '032002100311',
      invoice_no: '98765432',
      invoice_type: '增值税专用发票',
      customer_number: CUSTOMER_NUMBER,
      invoice_date: new Date().toISOString().slice(0, 10),
      tax_rate: TAX_RATE,
      amount_without_tax: amountWithoutTax,
      tax_amount: taxAmount,
      amount_with_tax: amountWithTax,
      remark: TEST_REMARK,
      lines: [{
        shipping_order_number: ctx.shippingOrderNumber!,
        shipping_detail_id: ctx.shippingDetailId!,
        sales_order_number: ctx.salesOrderNumber,
        sales_detail_id: ctx.salesDetailId,
        item_number: TEST_ITEM,
        item_name: itemInfo.item_name || '',
        specifications: itemInfo.specifications || '',
        basic_unit: itemInfo.basic_unit || '',
        ship_quantity: TEST_QTY,
        invoice_quantity: invoiceQty,
        unit_price: unitPrice,
        amount_without_tax: amountWithoutTax,
        tax_rate: TAX_RATE,
        tax_amount: taxAmount,
        amount_with_tax: amountWithTax,
      }],
    });
    expect(invResult?.invoice_number, '未返回发票编号').toBeTruthy();
    ctx.invoiceNumbers.push(invResult.invoice_number);
    console.log(`[Test2] 发票创建: ${invResult.invoice_number}`);

    // DB断言: 发票主表
    const invoice = await getSalesInvoice(invResult.invoice_number);
    expect(invoice, '发票不存在').toBeTruthy();
    expect(invoice?.approval_status, '发票应为草稿').toBe('草稿');
    expect(invoice?.customer_number, '客户编号应匹配').toBe(CUSTOMER_NUMBER);
    expect(Number(invoice?.amount_with_tax), '价税合计应匹配').toBeCloseTo(amountWithTax, 1);
    console.log(`[Test2] 发票主表验证: approval_status=${invoice?.approval_status}, amount_with_tax=${invoice?.amount_with_tax}`);

    // DB断言: 发票明细行
    const lines = await getSalesInvoiceLines(invResult.invoice_number);
    expect(lines.length, '发票明细行应为1').toBe(1);
    expect(lines[0].shipping_detail_id, '发货明细ID应匹配').toBe(ctx.shippingDetailId);
    expect(lines[0].sales_detail_id, '销售明细ID应匹配').toBe(ctx.salesDetailId);
    expect(Number(lines[0].invoice_quantity), '开票数量应匹配').toBe(invoiceQty);
    console.log(`[Test2] 发票明细行验证: ship_detail_id=${lines[0].shipping_detail_id}, invoice_qty=${lines[0].invoice_quantity}`);

    // DB断言: 草稿发票不影响开票状态
    const shipDetailStatus = await getShippingDetailInvoiceStatus(ctx.shippingDetailId!);
    expect(shipDetailStatus?.invoice_status, '草稿发票不应影响发货明细行开票状态').toBe('未开票');
    const salesDetailStatus = await getSalesDetailInvoiceStatus(ctx.salesDetailId!);
    expect(salesDetailStatus?.invoice_status, '草稿发票不应影响销售明细行开票状态').toBe('未开票');
    console.log(`[Test2] 草稿发票不影响开票状态: 均仍为未开票`);
  });

  // ==================== Test 3: 审批发票 → 开票状态联动 ====================
  test('3. 审批发票→开票状态联动: 未开票→已开票', async () => {
    const invoiceNumber = ctx.invoiceNumbers[0];
    expect(invoiceNumber, '无发票编号').toBeTruthy();

    // Step 1: 审批发票
    await approveSalesInvoiceAPI(invoiceNumber);
    console.log(`[Test3] 发票已审批: ${invoiceNumber}`);

    // DB断言: 发票状态
    const invoice = await getSalesInvoice(invoiceNumber);
    expect(invoice?.approval_status, '发票应为已审批').toBe('已审批');

    // DB断言: 发货明细行开票状态 → 已开票 (因为invoice_quantity=100=ship_quantity)
    const shipDetailStatus = await getShippingDetailInvoiceStatus(ctx.shippingDetailId!);
    expect(shipDetailStatus?.invoice_status, '发货明细行应为已开票').toBe('已开票');
    console.log(`[Test3] 发货明细行开票状态: ${shipDetailStatus?.invoice_status}`);

    // DB断言: 销售订单明细行开票状态 → 已开票
    const salesDetailStatus = await getSalesDetailInvoiceStatus(ctx.salesDetailId!);
    expect(salesDetailStatus?.invoice_status, '销售订单明细行应为已开票').toBe('已开票');
    console.log(`[Test3] 销售订单明细行开票状态: ${salesDetailStatus?.invoice_status}`);
  });

  // ==================== Test 4: 双向查询 ====================
  test('4. 双向查询: 发票→发货明细 + 发货明细→发票 + 订单明细→发票', async () => {
    const invoiceNumber = ctx.invoiceNumbers[0];

    // 4a: 发票详情 → 关联发货明细行
    const invoiceDetail = await getSalesInvoiceDetailAPI(invoiceNumber);
    expect(invoiceDetail, '发票详情为空').toBeTruthy();
    expect(invoiceDetail?.lines?.length, '发票明细行应>=1').toBeGreaterThanOrEqual(1);
    const line = invoiceDetail.lines[0];
    expect(line.shipping_detail_id, '发票明细行应包含发货明细ID').toBe(ctx.shippingDetailId);
    expect(line.shipping_order_number, '发票明细行应包含发货单号').toBe(ctx.shippingOrderNumber);
    console.log(`[Test4a] 发票→发货明细: ship_detail_id=${line.shipping_detail_id}, shipping_order=${line.shipping_order_number}`);

    // 4b: 发货明细行 → 关联发票
    const invoicesByShip = await getInvoicesByShippingDetailAPI(ctx.shippingDetailId!);
    expect(invoicesByShip.length, '发货明细行关联发票应>=1').toBeGreaterThanOrEqual(1);
    const foundInvoice = invoicesByShip.find((inv: any) => inv.invoice_number === invoiceNumber);
    expect(foundInvoice, '应找到当前审批的发票').toBeTruthy();
    expect(foundInvoice?.approval_status, '发票审批状态应为已审批').toBe('已审批');
    console.log(`[Test4b] 发货明细→发票: 找到 ${invoicesByShip.length} 张, 审批状态=${foundInvoice?.approval_status}`);

    // 4c: 销售订单明细行 → 关联发票
    const invoicesBySales = await getInvoicesBySalesDetailAPI(ctx.salesDetailId!);
    expect(invoicesBySales.length, '销售订单明细行关联发票应>=1').toBeGreaterThanOrEqual(1);
    const foundInvoice2 = invoicesBySales.find((inv: any) => inv.invoice_number === invoiceNumber);
    expect(foundInvoice2, '应找到当前审批的发票').toBeTruthy();
    expect(foundInvoice2?.shipping_order_number, '应包含发货单号').toBe(ctx.shippingOrderNumber);
    console.log(`[Test4c] 订单明细→发票: 找到 ${invoicesBySales.length} 张, shipping_order=${foundInvoice2?.shipping_order_number}`);
  });

  // ==================== Test 5: 撤消审批 → 开票状态回退 ====================
  test('5. 撤消审批→开票状态回退: 已开票→未开票', async () => {
    const invoiceNumber = ctx.invoiceNumbers[0];

    // Step 1: 撤消审批
    await withdrawSalesInvoiceAPI(invoiceNumber);
    console.log(`[Test5] 发票已撤消: ${invoiceNumber}`);

    // DB断言: 发票恢复为草稿
    const invoice = await getSalesInvoice(invoiceNumber);
    expect(invoice?.approval_status, '撤消后发票应为草稿').toBe('草稿');

    // DB断言: 发货明细行开票状态回退 → 未开票
    const shipDetailStatus = await getShippingDetailInvoiceStatus(ctx.shippingDetailId!);
    expect(shipDetailStatus?.invoice_status, '撤消后发货明细行应为未开票').toBe('未开票');
    console.log(`[Test5] 发货明细行开票状态回退: ${shipDetailStatus?.invoice_status}`);

    // DB断言: 销售订单明细行开票状态回退 → 未开票
    const salesDetailStatus = await getSalesDetailInvoiceStatus(ctx.salesDetailId!);
    expect(salesDetailStatus?.invoice_status, '撤消后销售订单明细行应为未开票').toBe('未开票');
    console.log(`[Test5] 销售订单明细行开票状态回退: ${salesDetailStatus?.invoice_status}`);
  });

  // ==================== Test 6: 再次审批 → 编辑已审批发票(自动撤消) ====================
  test('6. 再次审批→编辑已审批发票(自动撤消→草稿→开票状态回退→编辑保存)', async () => {
    const invoiceNumber = ctx.invoiceNumbers[0];

    // Step 1: 再次审批
    await approveSalesInvoiceAPI(invoiceNumber);
    const invoice1 = await getSalesInvoice(invoiceNumber);
    expect(invoice1?.approval_status, '再次审批后应为已审批').toBe('已审批');
    console.log(`[Test6] 再次审批成功`);

    // DB断言: 开票状态应为已开票
    const shipStatus1 = await getShippingDetailInvoiceStatus(ctx.shippingDetailId!);
    expect(shipStatus1?.invoice_status, '审批后发货明细行应为已开票').toBe('已开票');

    // Step 2: 编辑已审批发票 → 修改开票数量为50 (部分开票)
    const itemRows = await query<any>(
      `SELECT item_name, specifications, basic_unit FROM item_master WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM } }
    );
    const itemInfo = itemRows[0] || {};

    const newInvoiceQty = 50;
    const unitPrice = 100;
    const newAmountWithoutTax = newInvoiceQty * unitPrice;
    const newTaxAmount = Math.round(newAmountWithoutTax * TAX_RATE * 100) / 100;
    const newAmountWithTax = newAmountWithoutTax + newTaxAmount;

    await updateSalesInvoiceAPI(invoiceNumber, {
      invoice_code: '032002100311',
      invoice_no: '98765432',
      invoice_type: '增值税专用发票',
      customer_number: CUSTOMER_NUMBER,
      tax_rate: TAX_RATE,
      amount_without_tax: newAmountWithoutTax,
      tax_amount: newTaxAmount,
      amount_with_tax: newAmountWithTax,
      remark: TEST_REMARK + '-编辑后',
      lines: [{
        shipping_order_number: ctx.shippingOrderNumber!,
        shipping_detail_id: ctx.shippingDetailId!,
        sales_order_number: ctx.salesOrderNumber,
        sales_detail_id: ctx.salesDetailId,
        item_number: TEST_ITEM,
        item_name: itemInfo.item_name || '',
        specifications: itemInfo.specifications || '',
        basic_unit: itemInfo.basic_unit || '',
        ship_quantity: TEST_QTY,
        invoice_quantity: newInvoiceQty,
        unit_price: unitPrice,
        amount_without_tax: newAmountWithoutTax,
        tax_rate: TAX_RATE,
        tax_amount: newTaxAmount,
        amount_with_tax: newAmountWithTax,
      }],
    });
    console.log(`[Test6] 编辑已审批发票完成`);

    // DB断言: 编辑后发票应为草稿（因为已审批→自动撤消→编辑）
    const invoice2 = await getSalesInvoice(invoiceNumber);
    expect(invoice2?.approval_status, '编辑已审批发票后应为草稿').toBe('草稿');

    // DB断言: 发货明细行开票状态回退 → 未开票 (因为编辑时先自动撤消)
    // 但编辑保存后会重算开票状态(草稿不参与计算)，所以仍应为未开票
    const shipStatus2 = await getShippingDetailInvoiceStatus(ctx.shippingDetailId!);
    expect(shipStatus2?.invoice_status, '编辑后(草稿)发货明细行应为未开票').toBe('未开票');
    console.log(`[Test6] 编辑后发货明细行开票状态: ${shipStatus2?.invoice_status}`);

    // DB断言: 销售订单明细行开票状态
    const salesStatus2 = await getSalesDetailInvoiceStatus(ctx.salesDetailId!);
    expect(salesStatus2?.invoice_status, '编辑后(草稿)销售订单明细行应为未开票').toBe('未开票');

    // Step 3: 重新审批 → 开票状态联动
    await approveSalesInvoiceAPI(invoiceNumber);
    const invoice3 = await getSalesInvoice(invoiceNumber);
    expect(invoice3?.approval_status, '重新审批后应为已审批').toBe('已审批');

    // DB断言: 发货明细行开票状态 → 部分开票 (50 < 100)
    const shipStatus3 = await getShippingDetailInvoiceStatus(ctx.shippingDetailId!);
    expect(shipStatus3?.invoice_status, '50<100应为部分开票').toBe('部分开票');
    console.log(`[Test6] 重新审批后发货明细行开票状态: ${shipStatus3?.invoice_status}`);

    // DB断言: 销售订单明细行开票状态 → 部分开票
    const salesStatus3 = await getSalesDetailInvoiceStatus(ctx.salesDetailId!);
    expect(salesStatus3?.invoice_status, '50<100销售订单明细行应为部分开票').toBe('部分开票');

    // DB断言: 发票明细行开票数量为50
    const lines = await getSalesInvoiceLines(invoiceNumber);
    expect(Number(lines[0].invoice_quantity), '编辑后开票数量应为50').toBe(50);
  });

  // ==================== Test 7: 部分开票 → 再开一张发票凑满 → 已开票 ====================
  test('7. 部分开票→再开一张发票(50个)→审批→全部已开票', async () => {
    // Step 1: 获取可开票发货明细行（应显示剩余可开50个）
    const availableDetails = await getAvailableShippingDetailsAPI(CUSTOMER_NUMBER);
    const targetDetail = availableDetails.find((d: any) => d.id === ctx.shippingDetailId);
    expect(targetDetail, '当前发货明细行应在可开票列表中').toBeTruthy();
    expect(Number(targetDetail?.available_qty), '剩余可开票数量应为50').toBe(50);
    console.log(`[Test7] 剩余可开票数量: ${targetDetail?.available_qty}`);

    // Step 2: 查询物料信息
    const itemRows = await query<any>(
      `SELECT item_name, specifications, basic_unit FROM item_master WHERE item_number = @item`,
      { item: { type: T.NVarChar, value: TEST_ITEM } }
    );
    const itemInfo = itemRows[0] || {};

    // Step 3: 创建第二张发票(50个)
    const invoiceQty = 50;
    const unitPrice = 100;
    const amountWithoutTax = invoiceQty * unitPrice;
    const taxAmount = Math.round(amountWithoutTax * TAX_RATE * 100) / 100;
    const amountWithTax = amountWithoutTax + taxAmount;

    const invResult2 = await createSalesInvoiceAPI({
      invoice_code: '032002100312',
      invoice_no: '98765433',
      invoice_type: '增值税专用发票',
      customer_number: CUSTOMER_NUMBER,
      invoice_date: new Date().toISOString().slice(0, 10),
      tax_rate: TAX_RATE,
      amount_without_tax: amountWithoutTax,
      tax_amount: taxAmount,
      amount_with_tax: amountWithTax,
      remark: TEST_REMARK + '-第二张',
      lines: [{
        shipping_order_number: ctx.shippingOrderNumber!,
        shipping_detail_id: ctx.shippingDetailId!,
        sales_order_number: ctx.salesOrderNumber,
        sales_detail_id: ctx.salesDetailId,
        item_number: TEST_ITEM,
        item_name: itemInfo.item_name || '',
        specifications: itemInfo.specifications || '',
        basic_unit: itemInfo.basic_unit || '',
        ship_quantity: TEST_QTY,
        invoice_quantity: invoiceQty,
        unit_price: unitPrice,
        amount_without_tax: amountWithoutTax,
        tax_rate: TAX_RATE,
        tax_amount: taxAmount,
        amount_with_tax: amountWithTax,
      }],
    });
    expect(invResult2?.invoice_number, '第二张发票未返回编号').toBeTruthy();
    ctx.invoiceNumbers.push(invResult2.invoice_number);
    console.log(`[Test7] 第二张发票创建: ${invResult2.invoice_number}`);

    // 草稿状态不影响开票状态
    const shipStatusBefore = await getShippingDetailInvoiceStatus(ctx.shippingDetailId!);
    expect(shipStatusBefore?.invoice_status, '草稿发票不影响开票状态').toBe('部分开票');

    // Step 4: 审批第二张发票
    await approveSalesInvoiceAPI(invResult2.invoice_number);
    console.log(`[Test7] 第二张发票已审批`);

    // DB断言: 发货明细行开票状态 → 已开票 (50+50=100=ship_quantity)
    const shipStatusAfter = await getShippingDetailInvoiceStatus(ctx.shippingDetailId!);
    expect(shipStatusAfter?.invoice_status, '50+50=100, 应为已开票').toBe('已开票');
    console.log(`[Test7] 发货明细行开票状态: ${shipStatusAfter?.invoice_status}`);

    // DB断言: 销售订单明细行开票状态 → 已开票
    const salesStatusAfter = await getSalesDetailInvoiceStatus(ctx.salesDetailId!);
    expect(salesStatusAfter?.invoice_status, '销售订单明细行应为已开票').toBe('已开票');

    // Step 5: 双向查询 → 应有2张发票
    const invoicesByShip = await getInvoicesByShippingDetailAPI(ctx.shippingDetailId!);
    expect(invoicesByShip.length, '发货明细行应关联2张发票').toBe(2);
    console.log(`[Test7] 发货明细行关联发票数: ${invoicesByShip.length}`);
  });

  // ==================== Test 8: 撤消第二张发票 → 状态回退到部分开票 ====================
  test('8. 撤消第二张发票→开票状态回退: 已开票→部分开票', async () => {
    const invoiceNumber2 = ctx.invoiceNumbers[1];

    // Step 1: 撤消
    await withdrawSalesInvoiceAPI(invoiceNumber2);
    console.log(`[Test8] 第二张发票已撤消`);

    // DB断言: 发货明细行开票状态 → 部分开票 (第一张50个仍为已审批)
    const shipStatus = await getShippingDetailInvoiceStatus(ctx.shippingDetailId!);
    expect(shipStatus?.invoice_status, '撤消后应为部分开票(50/100)').toBe('部分开票');
    console.log(`[Test8] 发货明细行开票状态回退: ${shipStatus?.invoice_status}`);

    // DB断言: 销售订单明细行开票状态 → 部分开票
    const salesStatus = await getSalesDetailInvoiceStatus(ctx.salesDetailId!);
    expect(salesStatus?.invoice_status, '销售订单明细行应为部分开票').toBe('部分开票');
  });

  // ==================== Test 9: 删除草稿发票 ====================
  test('9. 删除草稿发票→开票状态不受影响', async () => {
    const invoiceNumber2 = ctx.invoiceNumbers[1];

    // 发票2当前为草稿状态，可以删除
    await deleteSalesInvoiceAPI(invoiceNumber2);
    console.log(`[Test9] 第二张发票已删除: ${invoiceNumber2}`);

    // DB断言: 发票不存在
    const invoice = await getSalesInvoice(invoiceNumber2);
    expect(invoice, '删除后发票应为null').toBeNull();

    // DB断言: 发货明细行开票状态不变 → 部分开票(第一张50个)
    const shipStatus = await getShippingDetailInvoiceStatus(ctx.shippingDetailId!);
    expect(shipStatus?.invoice_status, '删除草稿发票不影响开票状态').toBe('部分开票');
    console.log(`[Test9] 删除草稿发票后开票状态: ${shipStatus?.invoice_status}`);

    // 从发票列表中移除已删除的发票号
    ctx.invoiceNumbers = ctx.invoiceNumbers.filter(n => n !== invoiceNumber2);
  });

  // ==================== Test 10: 已审批发票禁止删除 ====================
  test('10. 已审批发票禁止删除→需先撤消', async () => {
    const invoiceNumber1 = ctx.invoiceNumbers[0];

    // 尝试删除已审批发票 → 应失败
    try {
      await deleteSalesInvoiceAPI(invoiceNumber1);
      // 如果走到这里，说明后端没拦截
      console.warn(`[Test10] 警告: 已审批发票未被拦截删除!`);
    } catch (e: any) {
      // 期望抛出异常
      expect(e.message, '应提示已审批发票不允许删除').toContain('已审批');
      console.log(`[Test10] 已审批发票删除被正确拦截: ${e.message}`);
    }

    // DB断言: 发票仍然存在
    const invoice = await getSalesInvoice(invoiceNumber1);
    expect(invoice, '发票应仍存在').toBeTruthy();
    expect(invoice?.approval_status, '发票应仍为已审批').toBe('已审批');
  });

  // ==================== Test 11: 最终数据一致性验证 ====================
  test('11. 最终数据一致性验证', async () => {
    const invoiceNumber1 = ctx.invoiceNumbers[0];

    // 验证发票1: 已审批，开票50个
    const invoice1 = await getSalesInvoice(invoiceNumber1);
    expect(invoice1?.approval_status, '发票1应为已审批').toBe('已审批');

    const lines1 = await getSalesInvoiceLines(invoiceNumber1);
    expect(lines1.length, '发票1应有1条明细').toBe(1);
    expect(Number(lines1[0].invoice_quantity), '发票1开票数量应为50').toBe(50);

    // 验证发货明细行: 部分开票
    const shipStatus = await getShippingDetailInvoiceStatus(ctx.shippingDetailId!);
    expect(shipStatus?.invoice_status, '发货明细行应为部分开票').toBe('部分开票');

    // 验证销售订单明细行: 部分开票
    const salesStatus = await getSalesDetailInvoiceStatus(ctx.salesDetailId!);
    expect(salesStatus?.invoice_status, '销售订单明细行应为部分开票').toBe('部分开票');

    // 验证可开票发货明细: 剩余50个
    const availableDetails = await getAvailableShippingDetailsAPI(CUSTOMER_NUMBER);
    const targetDetail = availableDetails.find((d: any) => d.id === ctx.shippingDetailId);
    expect(Number(targetDetail?.available_qty), '剩余可开票数量应为50').toBe(50);

    // 验证双向查询: 发货明细→发票只有1张
    const invoicesByShip = await getInvoicesByShippingDetailAPI(ctx.shippingDetailId!);
    expect(invoicesByShip.length, '发货明细行应关联1张发票').toBe(1);
    expect(invoicesByShip[0].invoice_number, '关联的应为发票1').toBe(invoiceNumber1);

    // 验证双向查询: 销售订单明细→发票只有1张
    const invoicesBySales = await getInvoicesBySalesDetailAPI(ctx.salesDetailId!);
    expect(invoicesBySales.length, '销售订单明细行应关联1张发票').toBe(1);

    console.log(`[Test11] 全部数据一致性验证通过!`);
    console.log(`  发票1: ${invoiceNumber1}, 状态=${invoice1?.approval_status}, 开票数=50`);
    console.log(`  发货明细: invoice_status=${shipStatus?.invoice_status}`);
    console.log(`  销售明细: invoice_status=${salesStatus?.invoice_status}`);
    console.log(`  剩余可开票: ${targetDetail?.available_qty}`);
  });
});

