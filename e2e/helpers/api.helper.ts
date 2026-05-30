/**
 * API 助手 - 通过 HTTP 直接调用后端，用于稳定地完成登录、审批等动作
 * 后端地址：http://localhost:3000/api/v1
 */
import { APIRequestContext, request } from '@playwright/test';
import { query, T } from './db.helper';

const API_BASE = 'http://localhost:3000/api/v1';

let cachedToken: string | null = null;
let cachedCtx: APIRequestContext | null = null;

/** 带重试的登录（处理 429 限频） */
export async function apiLogin(username = 'admin', password = 'admin123', maxRetries = 3): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const ctx = await request.newContext();
    try {
      const res = await ctx.post(`${API_BASE}/auth/login`, {
        data: { username, password },
      });
      if (res.ok()) {
        const body = await res.json();
        const token = body?.data?.token || body?.token;
        if (!token) throw new Error(`登录响应未返回 token: ${JSON.stringify(body)}`);
        cachedToken = token;
        return token;
      }
      if (res.status() === 429 && attempt < maxRetries) {
        const delay = attempt * 5000; // 5s, 10s
        console.log(`[apiLogin] 429 限频，${delay / 1000}s 后重试 (${attempt}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`登录失败 HTTP ${res.status()}: ${await res.text()}`);
    } finally {
      await ctx.dispose();
    }
  }
  throw new Error(`登录失败: ${maxRetries} 次重试后仍 429`);
}

/** 获取带 token 的 APIRequestContext（首次自动登录） */
export async function getApiContext(): Promise<APIRequestContext> {
  if (cachedCtx) return cachedCtx;
  if (!cachedToken) await apiLogin();
  cachedCtx = await request.newContext({
    extraHTTPHeaders: {
      Authorization: `Bearer ${cachedToken}`,
      'Content-Type': 'application/json',
    },
  });
  return cachedCtx;
}

/** 释放 API Context（在 afterAll 中调用） */
export async function disposeApiContext() {
  if (cachedCtx) {
    await cachedCtx.dispose();
    cachedCtx = null;
  }
  cachedToken = null;
}

/**
 * 通用审批流程：提交 → 审批通过
 * module 取值示例：'sales_order' / 'Production_plan'
 *
 * 容错：
 *   - 如果单据启用了工作流，/approval/approve 会返回 400（状态=审批中）
 *   - 降级直接 SQL 更新 approval_status 为已审批
 *   - 这在 E2E 场景下用于跳过复杂的 workflow 交互，下游业务逻辑只看 approval_status
 */
export async function submitAndApprove(module: string, recordId: string): Promise<void> {
  const ctx = await getApiContext();

  // 1. 先尝试提交审批（若已在流程中会返 400，忽略）
  const submitRes = await ctx.post(`${API_BASE}/approval/submit`, {
    data: { module, record_id: recordId, remark: 'E2E自动提交' },
  });
  if (!submitRes.ok() && submitRes.status() !== 400) {
    throw new Error(`[${module}] 提交审批失败 ${submitRes.status()}: ${await submitRes.text()}`);
  }

  // 2. 尝试走 /approval/approve 完成审批
  const approveRes = await ctx.post(`${API_BASE}/approval/approve`, {
    data: { module, record_id: recordId, remark: 'E2E自动审批' },
  });
  if (approveRes.ok()) {
    console.log(`[${module}] 审批成功，回调已触发`);
    return;
  }

  // 3. 审批失败（大概率是工作流接管），降级直接 SQL 更新状态
  console.warn(`[${module}] /approval/approve 失败 (${approveRes.status()}): ${await approveRes.text()}，降级直接 SQL 更新`);
  await forceApproveBySql(module, recordId);
}

/** 直接 SQL 把 approval_status 更为已审批（跳过工作流） */
async function forceApproveBySql(module: string, recordId: string): Promise<void> {
  const tableMap: Record<string, { table: string; pk: string }> = {
    sales_forecast: { table: 'sales_forecast', pk: 'forecast_number' },
    sales_order: { table: 'sales_order', pk: 'sales_order_number' },
    Production_plan: { table: 'Production_plan', pk: 'production_number' },
    purchase_order: { table: 'purchase_order', pk: 'purchase_order_number' },
    outsourcing_order: { table: 'outsourcing_order', pk: 'outsourcing_order_number' },
    production_order: { table: 'production_order', pk: 'production_order_number' },
    purchase_req: { table: 'purchase_req', pk: 'purchase_req_number' },
    process_task: { table: 'process_task', pk: 'process_task_number' },
    return_order: { table: 'return_order', pk: 'return_order_number' },
    shipping_request: { table: 'shipping_request', pk: 'request_number' },
    stock_count: { table: 'stock_count', pk: 'count_number' },
    stock_in: { table: 'stock_in', pk: 'stock_in_number' },
  };
  const cfg = tableMap[module];
  if (!cfg) throw new Error(`不支持的 module: ${module}`);

  await query(
    `UPDATE ${cfg.table} SET approval_status = N'已审批' WHERE ${cfg.pk} = @id`,
    { id: { type: T.NVarChar, value: recordId } }
  );
}

/** 反审（用于清理时需要把已审批单据改回草稿） */
export async function reverseApproval(module: string, recordId: string): Promise<void> {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/approval/reverse`, {
    data: { module, record_id: recordId, remark: 'E2E自动反审' },
  });
  if (!res.ok()) {
    console.warn(`[${module}] 反审失败 ${res.status()}: ${await res.text()}`);
  }
}

// ==================== 成品装箱管理 API ====================

export interface CreatePackingOrderInput {
  warehouse_number: string;
  warehouse_name?: string;
  item_number: string;
  item_name?: string;
  specifications?: string;
  basic_unit?: string;
  total_quantity: number;
  inner_pack_qty: number;
  outer_pack_qty?: number;
  selected_batches?: string[];
  remark?: string;
}

/** 创建装箱单 */
export async function createPackingOrderAPI(data: CreatePackingOrderInput) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/packing-orders`, { data });
  if (!res.ok()) {
    throw new Error(`创建装箱单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 确认装箱单 */
export async function confirmPackingOrderAPI(packingNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/packing-orders/${packingNumber}/confirm`);
  if (!res.ok()) {
    throw new Error(`确认装箱单失败 ${res.status()}: ${await res.text()}`);
  }
}

/** 取消装箱单 */
export async function cancelPackingOrderAPI(packingNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/packing-orders/${packingNumber}/cancel`);
  if (!res.ok()) {
    throw new Error(`取消装箱单失败 ${res.status()}: ${await res.text()}`);
  }
}

/** 整单拆箱 */
export async function unpackPackingOrderAPI(packingNumber: string, remark?: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/packing-orders/${packingNumber}/unpack`, {
    data: { remark: remark || 'E2E自动拆箱' },
  });
  if (!res.ok()) {
    throw new Error(`整单拆箱失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 逐箱拆箱 */
export async function unpackBoxesAPI(boxNumbers: string[], warehouseNumber: string, remark?: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/packing-orders/box-unpack`, {
    data: { box_numbers: boxNumbers, warehouse_number: warehouseNumber, remark: remark || 'E2E自动逐箱拆箱' },
  });
  if (!res.ok()) {
    throw new Error(`逐箱拆箱失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 扫箱码出库 */
export async function boxOutboundAPI(boxNumbers: string[], warehouseNumber: string, shippingOrderNumber?: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/packing-orders/box-outbound`, {
    data: {
      box_numbers: boxNumbers,
      warehouse_number: warehouseNumber,
      shipping_order_number: shippingOrderNumber || '',
      operator: 'E2E',
    },
  });
  if (!res.ok()) {
    throw new Error(`箱码出库失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 查询可用批次 */
export async function getAvailableBatchesAPI(itemNumber: string, warehouseNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(
    `${API_BASE}/packing-orders/available-batches?item_number=${encodeURIComponent(itemNumber)}&warehouse_number=${encodeURIComponent(warehouseNumber)}`
  );
  if (!res.ok()) {
    throw new Error(`查询可用批次失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return (body?.data || []) as any[];
}

// ==================== 采购来料检验 API ====================

export interface CreatePurchaseOrderInput {
  supplier_number: string;
  supplier_name: string;
  procurement_manager?: string;
  linkman?: string;
  contacts?: string;
  order_date?: string;
  delivery_date?: string;
  total_amount?: number;
  condition?: string;
  remark?: string;
  details: Array<{
    item_number: string;
    item_name: string;
    specifications?: string;
    basic_unit?: string;
    order_quantity: number;
    unit_price?: number;
    delivery_date?: string;
  }>;
}

/** 创建采购订单 */
export async function createPurchaseOrderAPI(data: CreatePurchaseOrderInput) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/purchase-orders`, { data });
  if (!res.ok()) {
    throw new Error(`创建采购订单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 获取采购订单可收货明细 */
export async function getPurchaseOrderReceivableAPI(purchaseOrderNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/purchase-orders/${purchaseOrderNumber}/receivable`);
  if (!res.ok()) {
    throw new Error(`获取可收货明细失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

export interface CreateReceivingNoticeInput {
  purchase_order_number: string;
  details: Array<{
    purchase_detail_id: number;
    item_number: string;
    item_name: string;
    specifications?: string;
    basic_unit?: string;
    order_quantity: number;
    received_quantity: number;
    receiving_quantity: number;
  }>;
}

/** 创建收货通知 */
export async function createReceivingNoticeAPI(data: CreateReceivingNoticeInput) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/receiving-notices`, { data });
  if (!res.ok()) {
    throw new Error(`创建收货通知失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 确认收货通知（触发检验路由） */
export async function confirmReceivingNoticeAPI(receivingNumber: string, data: {
  warehouse_number: string;
  warehouse_name: string;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/receiving-notices/${receivingNumber}/confirm`, { data });
  if (!res.ok()) {
    throw new Error(`确认收货通知失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 获取采购检验详情 */
export async function getPurchaseInspectionDetailAPI(inspectionNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/quality/quality-report/purchase-inspections/${inspectionNumber}`);
  if (!res.ok()) {
    throw new Error(`获取采购检验详情失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 更新采购检验 */
export async function updatePurchaseInspectionAPI(inspectionNumber: string, data: {
  purchase_order_number: string;
  qualified_quantity: number;
  unqualified_quantity: number;
  inspect_result?: string;
  details?: any[];
}) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/quality/quality-report/purchase-inspections/${inspectionNumber}`, { data });
  if (!res.ok()) {
    throw new Error(`更新采购检验失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body;
}

/** 完成采购检验 */
export async function completePurchaseInspectionAPI(inspectionNumber: string, data: {
  inspect_result: string;
  qualified_quantity: number;
  unqualified_quantity: number;
}) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/quality/quality-report/purchase-inspections/${inspectionNumber}/complete`, { data });
  if (!res.ok()) {
    throw new Error(`完成采购检验失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body;
}

// ==================== 委外来料检验 API ====================

export interface CreateOutsourcingOrderInput {
  process_task_number: string;
  outsourcing_supplier_number: string;
  supplier_number: string;
  supplier_name: string;
  unit_price?: number;
  order_date?: string;
  expected_return_date?: string;
  remark?: string;
}

/** 创建委外订单 */
export async function createOutsourcingOrderAPI(data: CreateOutsourcingOrderInput) {
  const ctx = await getApiContext();
  // 验证器要求 outsourcing_supplier_number，控制器读取 supplier_number，两者都传
  const payload = {
    ...data,
    outsourcing_supplier_number: data.outsourcing_supplier_number || data.supplier_number,
  };
  const res = await ctx.post(`${API_BASE}/outsourcing-orders`, { data: payload });
  if (!res.ok()) {
    throw new Error(`创建委外订单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 委外订单发出 */
export async function sendOutOutsourcingOrderAPI(orderNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/outsourcing-orders/${orderNumber}/send-out`);
  if (!res.ok()) {
    throw new Error(`委外订单发出失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body;
}

/** 确认委外收货（触发检验路由） */
export async function confirmOutsourcingReceiptAPI(receiptNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/outsourcing/receipt/${receiptNumber}/confirm`);
  if (!res.ok()) {
    throw new Error(`确认委外收货失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 更新委外检验 */
export async function updateOutsourcingInspectionAPI(inspectionNumber: string, data: {
  inspection_result: string;
  qualified_quantity: number;
  unqualified_quantity: number;
}) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/outsourcing/inspection/${inspectionNumber}`, { data });
  if (!res.ok()) {
    throw new Error(`更新委外检验失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body;
}

/** 完成委外检验 */
export async function completeOutsourcingInspectionAPI(inspectionNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/outsourcing/inspection/${inspectionNumber}/complete`);
  if (!res.ok()) {
    throw new Error(`完成委外检验失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body;
}

// ==================== 生产全链路 API ====================

/** 运行 MRP 计算 */
export async function runMrpAPI(productionNumbers: string[]) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/mrp/run`, {
    data: { production_numbers: productionNumbers },
  });
  if (!res.ok()) {
    throw new Error(`MRP运行失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 获取 MRP 运算详情 */
export async function getMrpRunDetailAPI(mrpRunNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/mrp/${mrpRunNumber}`);
  if (!res.ok()) {
    throw new Error(`获取MRP详情失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 执行 MRP（生成生产单+采购申请） */
export async function executeMrpAPI(mrpRunNumber: string, items: Array<{ id: number; produce_quantity?: number; purchase_quantity?: number }>) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/mrp/execute`, {
    data: { mrp_run_number: mrpRunNumber, items },
  });
  if (!res.ok()) {
    throw new Error(`MRP执行失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 生产单拆分 */
export async function splitOrdersAPI(items: Array<{
  type: 'original' | 'new';
  production_order_number?: string;
  source_order_number?: string;
  new_planned_quantity: number;
}>) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/orders/split`, { data: { items } });
  if (!res.ok()) {
    throw new Error(`生产单拆分失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 生产单派发+生成（工序任务+备料单） */
export async function dispatchAndGenerateAPI(items: Array<{
  production_order_number: string;
  production_date?: string;
  [key: string]: any;
}>) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/orders/dispatch-and-generate`, { data: { items } });
  if (!res.ok()) {
    throw new Error(`派发+生成失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 查询生产单的领料单 */
export async function getMaterialIssueQueryAPI(orderNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/material-issues/query-by-order/${orderNumber}`);
  if (!res.ok()) {
    throw new Error(`查询领料单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 创建领料单 */
export async function createMaterialIssueAPI(data: {
  preparation_number: string;
  production_order_number?: string;
  items: Array<{ preparation_detail_id?: number; material_number: string; actual_quantity: number; warehouse_number: string; step_number?: number; [key: string]: any }>;
  remark?: string;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/material-issues`, { data });
  if (!res.ok()) {
    throw new Error(`创建领料单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 快速报工 */
export async function quickReportAPI(data: {
  process_task_number: string;
  qualified_quantity: number;
  unqualified_quantity?: number;
  report_date?: string;
  remark?: string;
  [key: string]: any;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/work-reports/quick`, { data });
  if (!res.ok()) {
    throw new Error(`快速报工失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 完成生产单报工（最后一道工序+标记所有工序完成+自动入库） */
export async function completeOrderReportAPI(data: {
  production_order_number: string;
  qualified_quantity: number;
  unqualified_quantity?: number;
  [key: string]: any;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/work-reports/complete-order`, { data, timeout: 60000 });
  if (!res.ok()) {
    throw new Error(`完成生产单报工失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 半成品生产入库 */
export async function semiProductionInboundAPI(data: {
  warehouse_number: string;
  warehouse_name: string;
  items: Array<{
    production_order_number?: string;
    item_number: string;
    inbound_qty: number;
  }>;
  remark?: string;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/material-warehouse/production-inbound`, { data });
  if (!res.ok()) {
    throw new Error(`半成品生产入库失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 查询待入库列表 */
export async function getPendingInboundAPI(search?: string) {
  const ctx = await getApiContext();
  let url = `${API_BASE}/finished-goods/pending-inbound`;
  if (search) url += `?search=${encodeURIComponent(search)}`;
  const res = await ctx.get(url);
  if (!res.ok()) {
    throw new Error(`查询待入库失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 生产成品入库 */
export async function productionInboundAPI(data: {
  warehouse_number: string;
  warehouse_name: string;
  items: Array<{
    production_order_number?: string;
    item_number: string;
    item_name?: string;
    specifications?: string;
    basic_unit?: string;
    planned_quantity?: number;
    inbound_qty: number;
    inbound_quantity?: number;
  }>;
  remark?: string;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/finished-goods/inbound`, { data });
  if (!res.ok()) {
    throw new Error(`生产入库失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 采购申请转采购订单 */
export async function purchaseReqToOrderAPI(purchaseReqNumber: string, data: {
  detail_ids: number[];
  supplier_number: string;
  supplier_name: string;
  unit_prices?: Record<string, string>;
  remark?: string;
  [key: string]: any;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/purchase-reqs/${purchaseReqNumber}/to-order`, { data });
  if (!res.ok()) {
    throw new Error(`采购申请转单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data || body;
}

// ==================== 销售发货退货 API ====================

/** 创建销售订单 */
export async function createSalesOrderAPI(data: {
  customer_number: string;
  customer_name?: string;
  head_of_sales?: string;
  linkman?: string;
  contacts?: string;
  order_date?: string;
  delivery_date?: string;
  remark?: string;
  details: Array<{
    item_number: string;
    item_name?: string;
    specifications?: string;
    basic_unit?: string;
    product_drawing_number?: string;
    order_quantity: number;
    unit_price?: number;
    total_amount?: number;
    delivery_date?: string;
    remark?: string;
  }>;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sales-orders`, { data });
  if (!res.ok()) {
    throw new Error(`创建销售订单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 创建发货申请 */
export async function createShippingRequestAPI(data: {
  customer_number: string;
  customer_name?: string;
  remark?: string;
  details: Array<{
    sales_order_number: string;
    detail_id: number;
    item_number: string;
    item_name?: string;
    specifications?: string;
    basic_unit?: string;
    order_quantity: number;
    shipped_quantity: number;
    ship_quantity: number;
    delivery_date?: string;
    remark?: string;
  }>;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/shipping-requests`, { data });
  if (!res.ok()) {
    throw new Error(`创建发货申请失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 更新发货申请状态 */
export async function updateShippingRequestStatusAPI(requestNumber: string, status: string) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/shipping-requests/${requestNumber}/status`, {
    data: { status },
  });
  if (!res.ok()) {
    throw new Error(`更新发货申请状态失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 成品出库（批次FIFO/箱码模式） */
export async function batchOutboundAPI(data: {
  warehouse_number: string;
  warehouse_name: string;
  remark?: string;
  items: Array<{
    request_number: string;
    detail_id?: number;
    item_number: string;
    item_name?: string;
    specifications?: string;
    basic_unit?: string;
    ship_quantity: number;
    warehouse_number: string;
    warehouse_name: string;
    sales_detail_id?: number;
    batch_items?: Array<{ batch_number: string; quantity: number }>;
    box_numbers?: string[];
  }>;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/finished-goods/outbound`, { data });
  if (!res.ok()) {
    throw new Error(`成品出库失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 创建退货单 */
export async function createReturnOrderAPI(data: {
  shipping_order_number: string;
  type: string;
  warehouse_number?: string;
  warehouse_name?: string;
  reason?: string;
  remark?: string;
  details: Array<{
    shipping_order_detail_id: number;
    sales_order_number?: string;
    sales_detail_id: number;
    item_number: string;
    item_name?: string;
    specifications?: string;
    basic_unit?: string;
    shipped_quantity: number;
    return_quantity: number;
    remark?: string;
    batch_items?: Array<{ batch_number: string; quantity: number }>;
  }>;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/return-orders`, { data });
  if (!res.ok()) {
    throw new Error(`创建退货单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 确认退货单 */
export async function confirmReturnOrderAPI(returnOrderNumber: string, data?: { confirm_remark?: string }) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/return-orders/${returnOrderNumber}/confirm`, {
    data: data || { confirm_remark: 'E2E自动确认' },
  });
  if (!res.ok()) {
    throw new Error(`确认退货单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 驳回退货单 */
export async function rejectReturnOrderAPI(returnOrderNumber: string, data?: { confirm_remark?: string }) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/return-orders/${returnOrderNumber}/reject`, {
    data: data || { confirm_remark: 'E2E自动驳回' },
  });
  if (!res.ok()) {
    throw new Error(`驳回退货单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 退货入库 */
export async function returnInboundAPI(returnOrderNumber: string, data: {
  warehouse_number: string;
  warehouse_name: string;
  remark?: string;
  details: Array<{
    item_number: string;
    item_name?: string;
    specifications?: string;
    basic_unit?: string;
    return_quantity: number;
    qualified_qty: number;
    unqualified_qty: number;
    detail_id?: number;
  }>;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/finished-goods/return-inbound/${returnOrderNumber}`, { data });
  if (!res.ok()) {
    throw new Error(`退货入库失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

// ==================== 盘点管理 API ====================

/** 创建盘点单 POST /stock-counts */
export async function createStockCountAPI(data: {
  warehouse_number: string;
  count_period: string;
  count_type: string;
  warehouse_name?: string;
  item_numbers?: string[];
  remark?: string;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/stock-counts`, { data });
  if (!res.ok()) {
    throw new Error(`创建盘点单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 获取盘点单详情 GET /stock-counts/:count_number */
export async function getStockCountDetailAPI(countNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/stock-counts/${countNumber}`);
  if (!res.ok()) {
    throw new Error(`获取盘点单详情失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 更新盘点明细(录入实盘数量) PUT /stock-counts/:count_number */
export async function updateStockCountAPI(countNumber: string, data: {
  details: Array<{ id: number; actual_quantity: number; system_quantity: number; remark?: string }>;
}) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/stock-counts/${countNumber}`, { data });
  if (!res.ok()) {
    throw new Error(`更新盘点明细失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 提交复核 POST /stock-counts/:count_number/submit-review */
export async function submitReviewAPI(countNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/stock-counts/${countNumber}/submit-review`);
  if (!res.ok()) {
    throw new Error(`提交复核失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 复核 POST /stock-counts/:count_number/review */
export async function reviewStockCountAPI(countNumber: string, data: {
  action: 'approve' | 'reject';
  review_remark?: string;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/stock-counts/${countNumber}/review`, { data });
  if (!res.ok()) {
    throw new Error(`复核失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 确认执行(库存调整) POST /stock-counts/:count_number/confirm */
export async function confirmStockCountAPI(countNumber: string, data: {
  details: Array<{
    id: number;
    item_number: string;
    item_name: string;
    batch_number: string;
    batch_inventory_id: number;
    system_quantity: number;
    actual_quantity: number;
    difference_quantity: number;
    quality_status: string;
    remark: string;
    specifications?: string;
    basic_unit?: string;
    product_drawing_number?: string;
  }>;
  confirm_remark?: string;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/stock-counts/${countNumber}/confirm`, { data });
  if (!res.ok()) {
    throw new Error(`确认执行失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

// ==================== 成品库存查询/报表 API ====================

/** 已完成盘点单列表 GET /finished-goods/completed-stock-counts */
export async function getCompletedStockCountsAPI() {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/finished-goods/completed-stock-counts`);
  if (!res.ok()) {
    throw new Error(`获取已完成盘点单列表失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 月度出入库报表 GET /finished-goods/monthly-report */
export async function getMonthlyReportAPI(countNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/finished-goods/monthly-report?count_number=${encodeURIComponent(countNumber)}`);
  if (!res.ok()) {
    throw new Error(`获取月度报表失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 库存列表查询 GET /finished-goods/inventory */
export async function getInventoryListAPI(params: {
  search?: string;
  warehouse_number?: string;
  quality_status?: string;
}) {
  const ctx = await getApiContext();
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.warehouse_number) qs.set('warehouse_number', params.warehouse_number);
  if (params.quality_status) qs.set('quality_status', params.quality_status);
  const url = `${API_BASE}/finished-goods/inventory?${qs.toString()}`;
  const res = await ctx.get(url);
  if (!res.ok()) {
    throw new Error(`获取库存列表失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 库存详情+流水 GET /finished-goods/inventory/detail */
export async function getInventoryDetailAPI(params: {
  item_number: string;
  warehouse_number?: string;
  inventory_type?: string;
}) {
  const ctx = await getApiContext();
  const qs = new URLSearchParams();
  qs.set('item_number', params.item_number);
  if (params.warehouse_number) qs.set('warehouse_number', params.warehouse_number);
  if (params.inventory_type) qs.set('inventory_type', params.inventory_type);
  const url = `${API_BASE}/finished-goods/inventory/detail?${qs.toString()}`;
  const res = await ctx.get(url);
  if (!res.ok()) {
    throw new Error(`获取库存详情失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

// ==================== 销售预测 API ====================

/** 创建销售预测 */
export async function createForecastAPI(data: {
  customer_number: string;
  customer_name?: string;
  forecast_date?: string;
  remark?: string;
  details: Array<{
    item_number: string;
    item_name?: string;
    specifications?: string;
    basic_unit?: string;
    product_drawing_number?: string;
    forecast_quantity: number;
    start_date?: string;
    end_date?: string;
    remark?: string;
  }>;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/forecasts`, { data });
  if (!res.ok()) {
    throw new Error(`创建销售预测失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 获取销售预测详情 */
export async function getForecastDetailAPI(forecastNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/forecasts/${forecastNumber}`);
  if (!res.ok()) {
    throw new Error(`获取销售预测详情失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

// ==================== MPS API ====================

/** MPS计算 */
export async function calculateMpsAPI(params: {
  customer_number?: string;
  start_date?: string;
  end_date?: string;
}) {
  const ctx = await getApiContext();
  const qs = new URLSearchParams();
  if (params.customer_number) qs.set('customer_number', params.customer_number);
  if (params.start_date) qs.set('start_date', params.start_date);
  if (params.end_date) qs.set('end_date', params.end_date);
  const url = `${API_BASE}/mps/calculate?${qs.toString()}`;
  const res = await ctx.get(url);
  if (!res.ok()) {
    throw new Error(`MPS计算失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 获取需求来源(销售订单+销售预测混合列表) */
export async function getDemandSourcesAPI(itemNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/mps/demand-sources?item_number=${encodeURIComponent(itemNumber)}`);
  if (!res.ok()) {
    throw new Error(`获取需求来源失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 从需求来源导入生产计划 */
export async function importFromDemandSourcesAPI(items: Array<{
  source_type: string;
  detail_id: number;
  source_number: string;
  line_number: number;
  item_number: string;
  item_name?: string;
  specifications?: string;
  basic_unit?: string;
  product_drawing_number?: string;
  remaining_quantity?: number;
  quantity?: number;
  delivery_date?: string;
  batch_production_quota?: string;
  rubber_compound_number?: string;
  [key: string]: any;
}>) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/mps/import-from-demand-sources`, {
    data: { items },
  });
  if (!res.ok()) {
    throw new Error(`从需求来源导入失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

// ==================== 甘特图+打印 API ====================

/** 获取甘特图数据 */
export async function getGanttDataAPI(params: {
  startDate?: string;
  endDate?: string;
  search?: string;
  equipmentNumber?: string;
}) {
  const ctx = await getApiContext();
  const qs = new URLSearchParams();
  if (params.startDate) qs.set('startDate', params.startDate);
  if (params.endDate) qs.set('endDate', params.endDate);
  if (params.search) qs.set('search', params.search);
  if (params.equipmentNumber) qs.set('equipmentNumber', params.equipmentNumber);
  const url = `${API_BASE}/orders/gantt?${qs.toString()}`;
  const res = await ctx.get(url);
  if (!res.ok()) {
    throw new Error(`获取甘特图数据失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 获取打印数据 */
export async function getPrintDataAPI(productionOrderNumbers: string[]) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/orders/print-data`, {
    data: { production_order_numbers: productionOrderNumbers },
  });
  if (!res.ok()) {
    throw new Error(`获取打印数据失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

// ==================== 通用 DELETE API ====================

/** 通用删除API */
export async function deleteAPI(path: string) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/${path}`);
  if (!res.ok()) {
    throw new Error(`删除失败 [${path}] ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

// ==================== 生产检验 API ====================

/** 获取生产检验(按工单) */
export async function getProductionInspectionsByOrderAPI(orderNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/quality/production-inspections/by-order/${orderNumber}`);
  if (!res.ok()) {
    throw new Error(`获取生产检验失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 更新生产检验 */
export async function updateProductionInspectionAPI(inspectionNumber: string, data: {
  qualified_quantity?: number;
  unqualified_quantity?: number;
  inspector_name?: string;
  [key: string]: any;
}) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/quality/production-inspections/${inspectionNumber}`, { data });
  if (!res.ok()) {
    throw new Error(`更新生产检验失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 完成生产检验(自动判定合格/不合格) */
export async function completeProductionInspectionAPI(inspectionNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/quality/production-inspections/${inspectionNumber}/complete`);
  if (!res.ok()) {
    throw new Error(`完成生产检验失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 不合格品缺陷处理(创建NC单) */
export async function defectHandlingAPI(inspectionNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/quality/production-inspections/${inspectionNumber}/defect-handling`);
  if (!res.ok()) {
    throw new Error(`缺陷处理失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

// ==================== 不合格品 API ====================

/** 获取NC单详情 */
export async function getNonconformingProductAPI(ncNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/quality/nonconforming-products/${ncNumber}`);
  if (!res.ok()) {
    throw new Error(`获取NC单详情失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 处理NC单(返修/报废/让步接收) */
export async function handleNonconformingAPI(ncNumber: string, data: {
  handling_method: string;       // 返修/报废/让步接收
  concession_quantity?: number;
  scrap_type?: string;
  scrap_quantity?: number;
  rework_step_number?: number;
  handling_remark?: string;
}) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/quality/nonconforming-products/${ncNumber}/handle`, { data });
  if (!res.ok()) {
    throw new Error(`处理NC单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

// ==================== 返修单 API ====================

/** 获取返修单详情 */
export async function getReworkOrderAPI(reworkOrderNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/quality/rework-orders/${reworkOrderNumber}`);
  if (!res.ok()) {
    throw new Error(`获取返修单详情失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 完成返修单 */
export async function completeReworkOrderAPI(reworkOrderNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/quality/rework-orders/${reworkOrderNumber}/complete`);
  if (!res.ok()) {
    throw new Error(`完成返修单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 返修重新检验 */
export async function reworkReInspectAPI(reworkOrderNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/quality/rework-orders/${reworkOrderNumber}/re-inspect`);
  if (!res.ok()) {
    throw new Error(`返修重新检验失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

// ==================== 报工删除 API ====================

/** 删除报工单(仅草稿) */
export async function deleteWorkReportAPI(workReportNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/work-reports/${workReportNumber}`);
  if (!res.ok()) {
    throw new Error(`删除报工单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

// ==================== 生产入库撤回 API ====================

/** 生产入库撤回 */
export async function withdrawInboundOrderAPI(inboundOrderNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/finished-goods/inbound-orders/${inboundOrderNumber}/withdraw`);
  if (!res.ok()) {
    throw new Error(`生产入库撤回失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 查询入库单列表 */
export async function getInboundOrderListAPI(params?: {
  search?: string;
  status?: string;
}) {
  const ctx = await getApiContext();
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.status) qs.set('status', params.status);
  const url = `${API_BASE}/finished-goods/inbound-orders?${qs.toString()}`;
  const res = await ctx.get(url);
  if (!res.ok()) {
    throw new Error(`查询入库单列表失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 查询入库单详情 */
export async function getInboundOrderDetailAPI(inboundOrderNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/finished-goods/inbound-orders/${inboundOrderNumber}`);
  if (!res.ok()) {
    throw new Error(`查询入库单详情失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 查询成品库存流水列表 */
export async function getTransactionListAPI(params?: {
  page?: number;
  limit?: number;
  search?: string;
  transaction_type?: string;
  source_type?: string;
  status?: string;
}) {
  const ctx = await getApiContext();
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.search) qs.set('search', params.search);
  if (params?.transaction_type) qs.set('transaction_type', params.transaction_type);
  if (params?.source_type) qs.set('source_type', params.source_type);
  if (params?.status) qs.set('status', params.status);
  const url = `${API_BASE}/finished-goods/transactions?${qs.toString()}`;
  const res = await ctx.get(url);
  if (!res.ok()) {
    throw new Error(`查询库存流水列表失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

// ==================== 其他出入库 ====================
export async function createAbnormalIOAPI(data: {
  type: string;
  warehouse_number: string;
  warehouse_name: string;
  target_warehouse_number?: string;
  target_warehouse_name?: string;
  reason?: string;
  remark?: string;
  details: Array<{
    item_number: string;
    item_name?: string;
    quantity?: number;
    system_quantity?: number;
    actual_quantity?: number;
    difference_quantity?: number;
    unit?: string;
  }>;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/abnormal-io`, { data });
  if (!res.ok()) {
    throw new Error(`创建其他出入库失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

export async function confirmAbnormalIOAPI(requestNumber: string, data?: { confirm_remark?: string }) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/abnormal-io/${requestNumber}/confirm`, { data: data || {} });
  if (!res.ok()) {
    throw new Error(`确认其他出入库失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

export async function rejectAbnormalIOAPI(requestNumber: string, data?: { confirm_remark?: string }) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/abnormal-io/${requestNumber}/reject`, { data: data || {} });
  if (!res.ok()) {
    throw new Error(`驳回其他出入库失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

export async function withdrawAbnormalIOAPI(requestNumber: string, data?: { remark?: string }) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/abnormal-io/${requestNumber}/withdraw`, { data: data || {} });
  if (!res.ok()) {
    throw new Error(`撤消其他出入库失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

export async function deleteAbnormalIOAPI(requestNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/abnormal-io/${requestNumber}`);
  if (!res.ok()) {
    throw new Error(`删除其他出入库失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

export async function getAbnormalIODetailAPI(requestNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/abnormal-io/${requestNumber}`);
  if (!res.ok()) {
    throw new Error(`获取其他出入库详情失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

// ==================== 采购入库 API ====================

/** 创建采购入库单 */
export async function createStockInAPI(data: {
  purchase_order_number: string;
  warehouse_number: string;
  warehouse_name: string;
  stock_in_type?: string;
  remark?: string;
  details: Array<{
    purchase_detail_id: number;
    item_number: string;
    item_name: string;
    specifications?: string;
    basic_unit?: string;
    order_quantity: number;
    received_quantity: number;
    stock_in_quantity: number;
    qualified_quantity: number;
    unqualified_quantity?: number;
    remark?: string;
  }>;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/stock-ins`, { data });
  if (!res.ok()) {
    throw new Error(`创建入库单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 获取入库单列表 */
export async function getStockInListAPI(params?: {
  search?: string;
  approval_status?: string;
  page?: number;
  limit?: number;
}) {
  const ctx = await getApiContext();
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.approval_status) qs.set('approval_status', params.approval_status);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const url = `${API_BASE}/stock-ins?${qs.toString()}`;
  const res = await ctx.get(url);
  if (!res.ok()) {
    throw new Error(`获取入库单列表失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 获取入库单详情 */
export async function getStockInDetailAPI(stockInNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/stock-ins/${encodeURIComponent(stockInNumber)}`);
  if (!res.ok()) {
    throw new Error(`获取入库单详情失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 确认入库 */
export async function confirmStockInAPI(stockInNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/stock-ins/${encodeURIComponent(stockInNumber)}/confirm`);
  if (!res.ok()) {
    throw new Error(`确认入库失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body;
}

/** 撤回入库 */
export async function withdrawStockInAPI(stockInNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/stock-ins/${encodeURIComponent(stockInNumber)}/withdraw`);
  if (!res.ok()) {
    throw new Error(`撤回入库失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body;
}

/** 删除入库单（草稿状态） */
export async function deleteStockInAPI(stockInNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/stock-ins/${encodeURIComponent(stockInNumber)}`);
  if (!res.ok()) {
    throw new Error(`删除入库单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body;
}

// ==================== 销售发票 API ====================

/** 创建销售发票 */
export async function createSalesInvoiceAPI(data: {
  invoice_code?: string;
  invoice_no?: string;
  invoice_type?: string;
  customer_number: string;
  customer_name?: string;
  invoice_title?: string;
  tax_id?: string;
  invoice_address?: string;
  invoice_phone?: string;
  bank_name?: string;
  bank_account_number?: string;
  invoice_date?: string;
  tax_rate?: number;
  amount_without_tax?: number;
  tax_amount?: number;
  amount_with_tax?: number;
  currency_code?: string;
  remark?: string;
  lines: Array<{
    shipping_order_number: string;
    shipping_detail_id: number;
    sales_order_number?: string;
    sales_detail_id?: number;
    item_number: string;
    item_name?: string;
    specifications?: string;
    basic_unit?: string;
    ship_quantity: number;
    invoice_quantity: number;
    unit_price?: number;
    amount_without_tax?: number;
    tax_rate?: number;
    tax_amount?: number;
    amount_with_tax?: number;
    remark?: string;
  }>;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sales-invoices`, { data });
  if (!res.ok()) {
    throw new Error(`创建销售发票失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 获取销售发票详情 */
export async function getSalesInvoiceDetailAPI(invoiceNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/sales-invoices/${encodeURIComponent(invoiceNumber)}`);
  if (!res.ok()) {
    throw new Error(`获取销售发票详情失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 更新销售发票 */
export async function updateSalesInvoiceAPI(invoiceNumber: string, data: any) {
  const ctx = await getApiContext();
  const res = await ctx.put(`${API_BASE}/sales-invoices/${encodeURIComponent(invoiceNumber)}`, { data });
  if (!res.ok()) {
    throw new Error(`更新销售发票失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 删除销售发票 */
export async function deleteSalesInvoiceAPI(invoiceNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/sales-invoices/${encodeURIComponent(invoiceNumber)}`);
  if (!res.ok()) {
    throw new Error(`删除销售发票失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 查询入库单列表 */
export async function getInboundOrdersAPI(params?: { search?: string; page?: number; limit?: number }) {
  const ctx = await getApiContext();
  let url = `${API_BASE}/finished-goods/inbound-orders`;
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (qs.toString()) url += `?${qs.toString()}`;
  const res = await ctx.get(url);
  if (!res.ok()) {
    throw new Error(`查询入库单列表失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** WIP在制品报告 - 按生产单 */
export async function getWipByOrderAPI(productionOrderNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/wip-report/by-order/${productionOrderNumber}`);
  if (!res.ok()) {
    throw new Error(`查询WIP报告失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 质量透视报表 */
export async function getQualityPivotAPI(params?: { page?: number; limit?: number; search?: string; start_date?: string; end_date?: string }) {
  const ctx = await getApiContext();
  let url = `${API_BASE}/quality/quality-report/production-order-pivot`;
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.search) qs.set('search', params.search);
  if (params?.start_date) qs.set('start_date', params.start_date);
  if (params?.end_date) qs.set('end_date', params.end_date);
  if (qs.toString()) url += `?${qs.toString()}`;
  const res = await ctx.get(url);
  if (!res.ok()) {
    throw new Error(`查询质量透视报表失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 审批销售发票 */
export async function approveSalesInvoiceAPI(invoiceNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sales-invoices/${encodeURIComponent(invoiceNumber)}/approve`);
  if (!res.ok()) {
    throw new Error(`审批销售发票失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 撤消审批销售发票 */
export async function withdrawSalesInvoiceAPI(invoiceNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/sales-invoices/${encodeURIComponent(invoiceNumber)}/withdraw`);
  if (!res.ok()) {
    throw new Error(`撤消销售发票失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 获取可开票发货明细行 */
export async function getAvailableShippingDetailsAPI(customerNumber: string, excludeInvoice?: string) {
  const ctx = await getApiContext();
  let url = `${API_BASE}/sales-invoices/available-shipping-details?customer_number=${encodeURIComponent(customerNumber)}`;
  if (excludeInvoice) url += `&exclude_invoice=${encodeURIComponent(excludeInvoice)}`;
  const res = await ctx.get(url);
  if (!res.ok()) {
    throw new Error(`获取可开票发货明细失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return (body?.data || []) as any[];
}

/** 根据发货明细查关联发票 */
export async function getInvoicesByShippingDetailAPI(detailId: number) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/sales-invoices/by-shipping-detail/${detailId}`);
  if (!res.ok()) {
    throw new Error(`查询发货明细关联发票失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return (body?.data || []) as any[];
}

/** 根据销售订单明细查关联发票 */
export async function getInvoicesBySalesDetailAPI(detailId: number) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/sales-invoices/by-sales-detail/${detailId}`);
  if (!res.ok()) {
    throw new Error(`查询销售订单明细关联发票失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return (body?.data || []) as any[];
}

// ==================== 备料退料补料 API ====================

/** 创建领料单（支持 source_type） */
export async function createMaterialIssueV2API(data: {
  preparation_number: string;
  production_order_number?: string;
  source_type?: string;
  items: Array<{ preparation_detail_id?: number; material_number: string; actual_quantity: number; warehouse_number: string; step_number?: number; [key: string]: any }>;
  remark?: string;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/material-issues`, { data });
  if (!res.ok()) {
    throw new Error(`创建领料单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 撤回/删除领料单 */
export async function deleteMaterialIssueAPI(issueNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/material-issues/${issueNumber}`);
  if (!res.ok()) {
    throw new Error(`撤回领料单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 创建退料单 */
export async function createMaterialReturnAPI(data: {
  issue_number: string;
  items: Array<{ material_number: string; return_quantity: number; batch_number?: string }>;
  remark?: string;
}) {
  const ctx = await getApiContext();
  const res = await ctx.post(`${API_BASE}/material-returns`, { data });
  if (!res.ok()) {
    throw new Error(`创建退料单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 撤回/删除退料单 */
export async function deleteMaterialReturnAPI(returnNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.delete(`${API_BASE}/material-returns/${returnNumber}`);
  if (!res.ok()) {
    throw new Error(`撤回退料单失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 查询退料单列表 */
export async function getMaterialReturnsAPI(params?: Record<string, string>) {
  const ctx = await getApiContext();
  let url = `${API_BASE}/material-returns`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    url += `?${qs}`;
  }
  const res = await ctx.get(url);
  if (!res.ok()) {
    throw new Error(`查询退料单列表失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}

/** 查询退料单详情 */
export async function getMaterialReturnDetailAPI(returnNumber: string) {
  const ctx = await getApiContext();
  const res = await ctx.get(`${API_BASE}/material-returns/${returnNumber}`);
  if (!res.ok()) {
    throw new Error(`查询退料单详情失败 ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data;
}
