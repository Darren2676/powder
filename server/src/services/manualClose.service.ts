/**
 * 批量手工关闭服务
 * 异常检测 → 提交关闭申请 → 审批 → 执行关闭+级联
 */
import sequelize from '@/config/database';
import { createLogger } from '@/config/logger';
import { MANUAL_CLOSE_STATUS, CLOSE_REASON } from '@/shared/constants/statuses';
import { withTransaction } from '@/shared/db/withTransaction';

const log = createLogger('manualClose');

// ==================== 类型定义 ====================

interface ExceptionItem {
  code: string;
  label: string;
  description: string;
  details: any[];
}

interface CascadePreview {
  downstreamType: string;
  count: number;
  items: string[];
}

interface DetectResult {
  recordId: string;
  eligible: boolean;
  ineligibleReason?: string;
  currentStatus: Record<string, any>;
  exceptions: ExceptionItem[];
  cascadePreview: CascadePreview[];
}

interface BatchResult {
  succeeded: string[];
  failed: Array<{ recordId: string; message: string }>;
}

// ==================== 异常检测 ====================

export async function detectExceptions(module: string, recordIds: string[]): Promise<DetectResult[]> {
  const results: DetectResult[] = [];

  for (const recordId of recordIds) {
    try {
      switch (module) {
        case 'sales_order':
          results.push(await detectSalesOrderExceptions(recordId));
          break;
        case 'production_order':
          results.push(await detectProductionOrderExceptions(recordId));
          break;
        case 'purchase_order':
          results.push(await detectPurchaseOrderExceptions(recordId));
          break;
        default:
          results.push({ recordId, eligible: false, ineligibleReason: '不支持的单据类型', currentStatus: {}, exceptions: [], cascadePreview: [] });
      }
    } catch (e) {
      log.warn({ module, recordId, error: (e as Error).message }, '异常检测失败');
      results.push({ recordId, eligible: false, ineligibleReason: (e as Error).message, currentStatus: {}, exceptions: [], cascadePreview: [] });
    }
  }

  return results;
}

// ---------- 销售订单异常检测 ----------

async function detectSalesOrderExceptions(salesOrderNumber: string): Promise<DetectResult> {
  const [headers]: any = await sequelize.query(
    `SELECT order_status, approval_status FROM sales_order WHERE sales_order_number = :num`,
    { replacements: { num: salesOrderNumber } }
  );
  if (!headers.length) {
    return { recordId: salesOrderNumber, eligible: false, ineligibleReason: '订单不存在', currentStatus: {}, exceptions: [], cascadePreview: [] };
  }
  const header = headers[0];

  // 不可关闭检查
  if (header.order_status === '已取消') {
    return { recordId: salesOrderNumber, eligible: false, ineligibleReason: '订单已取消', currentStatus: header, exceptions: [], cascadePreview: [] };
  }
  if (header.order_status === '已完成') {
    return { recordId: salesOrderNumber, eligible: false, ineligibleReason: '订单已完成', currentStatus: header, exceptions: [], cascadePreview: [] };
  }
  if (header.approval_status !== '已审批') {
    return { recordId: salesOrderNumber, eligible: false, ineligibleReason: '订单未审批，不可关闭', currentStatus: header, exceptions: [], cascadePreview: [] };
  }

  const [details]: any = await sequelize.query(
    `SELECT id, item_number, item_name, order_quantity, shipped_quantity, status, shipping_status, production_status, return_status FROM sales_order_detail WHERE sales_order_number = :num`,
    { replacements: { num: salesOrderNumber } }
  );

  const exceptions: ExceptionItem[] = [];
  const activeDetails = details.filter((d: any) => d.status !== '已作废');

  // SO_SHIP: 发货异常
  const shipIssues = activeDetails.filter((d: any) => !['全部发货', '超额发货'].includes(d.shipping_status));
  if (shipIssues.length > 0) {
    exceptions.push({
      code: 'SO_SHIP', label: '发货异常', description: `${shipIssues.length}行未完成发货`,
      details: shipIssues.map((d: any) => ({ item: d.item_name || d.item_number, shipping_status: d.shipping_status, shipped: d.shipped_quantity, ordered: d.order_quantity })),
    });
  }

  // SO_PROD: 生产异常
  const prodIssues = activeDetails.filter((d: any) => d.production_status !== '生产完成');
  if (prodIssues.length > 0) {
    exceptions.push({
      code: 'SO_PROD', label: '生产异常', description: `${prodIssues.length}行生产未完成`,
      details: prodIssues.map((d: any) => ({ item: d.item_name || d.item_number, production_status: d.production_status })),
    });
  }

  // SO_RETURN: 退货异常
  const returnIssues = activeDetails.filter((d: any) => !['未申请', '未退货'].includes(d.return_status));
  if (returnIssues.length > 0) {
    exceptions.push({
      code: 'SO_RETURN', label: '退货异常', description: `${returnIssues.length}行有退货处理中`,
      details: returnIssues.map((d: any) => ({ item: d.item_name || d.item_number, return_status: d.return_status })),
    });
  }

  // 级联预览
  const cascadePreview: CascadePreview[] = [];
  const [shipReqs]: any = await sequelize.query(
    `SELECT DISTINCT sr.request_number FROM shipping_request sr INNER JOIN shipping_request_detail srd ON sr.request_number = srd.request_number WHERE srd.sales_order_number = :num AND sr.status NOT IN (N'已发货', N'已取消')`,
    { replacements: { num: salesOrderNumber } }
  );
  if (shipReqs.length > 0) {
    cascadePreview.push({ downstreamType: 'shipping_request', count: shipReqs.length, items: shipReqs.map((r: any) => r.request_number) });
  }

  return { recordId: salesOrderNumber, eligible: true, currentStatus: header, exceptions, cascadePreview };
}

// ---------- 生产订单异常检测 ----------

async function detectProductionOrderExceptions(productionOrderNumber: string): Promise<DetectResult> {
  const [headers]: any = await sequelize.query(
    `SELECT plan_status, inbound_status, completion_status, approval_status FROM production_order WHERE production_order_number = :num`,
    { replacements: { num: productionOrderNumber } }
  );
  if (!headers.length) {
    return { recordId: productionOrderNumber, eligible: false, ineligibleReason: '订单不存在', currentStatus: {}, exceptions: [], cascadePreview: [] };
  }
  const header = headers[0];

  if (header.completion_status === '已完成') {
    return { recordId: productionOrderNumber, eligible: false, ineligibleReason: '订单已完成', currentStatus: header, exceptions: [], cascadePreview: [] };
  }
  if (header.completion_status === '已关闭') {
    return { recordId: productionOrderNumber, eligible: false, ineligibleReason: '订单已关闭', currentStatus: header, exceptions: [], cascadePreview: [] };
  }
  if (header.approval_status !== '已审批') {
    return { recordId: productionOrderNumber, eligible: false, ineligibleReason: '订单未审批，不可关闭', currentStatus: header, exceptions: [], cascadePreview: [] };
  }

  const exceptions: ExceptionItem[] = [];

  // PO_EXEC: 执行异常
  if (header.plan_status !== '已完成') {
    exceptions.push({ code: 'PO_EXEC', label: '执行异常', description: `当前状态: ${header.plan_status}`, details: [{ plan_status: header.plan_status }] });
  }

  // PO_INBOUND: 入库异常
  if (header.inbound_status !== '全部入库') {
    exceptions.push({ code: 'PO_INBOUND', label: '入库异常', description: `当前状态: ${header.inbound_status}`, details: [{ inbound_status: header.inbound_status }] });
  }

  // PO_QUALITY: 质量异常
  const [inspectIssues]: any = await sequelize.query(
    `SELECT process_task_number, step_number, standard_process_name, inspect_status FROM process_task WHERE production_order_number = :num AND inspect_status NOT IN (N'检验合格', N'无需检', N'已处理') AND task_status IN (N'已完成', N'进行中')`,
    { replacements: { num: productionOrderNumber } }
  );
  if (inspectIssues.length > 0) {
    exceptions.push({
      code: 'PO_QUALITY', label: '质量异常', description: `${inspectIssues.length}道工序检验未通过`,
      details: inspectIssues.map((t: any) => ({ task: t.process_task_number, step: t.step_number, process: t.standard_process_name, inspect_status: t.inspect_status })),
    });
  }

  // 级联预览
  const cascadePreview: CascadePreview[] = [];
  const [pendingTasks]: any = await sequelize.query(
    `SELECT process_task_number FROM process_task WHERE production_order_number = :num AND task_status NOT IN (N'已完成', N'已关闭')`,
    { replacements: { num: productionOrderNumber } }
  );
  if (pendingTasks.length > 0) {
    cascadePreview.push({ downstreamType: 'process_task', count: pendingTasks.length, items: pendingTasks.map((t: any) => t.process_task_number) });
  }

  return { recordId: productionOrderNumber, eligible: true, currentStatus: header, exceptions, cascadePreview };
}

// ---------- 采购订单异常检测 ----------

async function detectPurchaseOrderExceptions(purchaseOrderNumber: string): Promise<DetectResult> {
  const [headers]: any = await sequelize.query(
    `SELECT order_status, approval_status FROM purchase_order WHERE purchase_order_number = :num`,
    { replacements: { num: purchaseOrderNumber } }
  );
  if (!headers.length) {
    return { recordId: purchaseOrderNumber, eligible: false, ineligibleReason: '订单不存在', currentStatus: {}, exceptions: [], cascadePreview: [] };
  }
  const header = headers[0];

  if (header.order_status === '已关闭') {
    return { recordId: purchaseOrderNumber, eligible: false, ineligibleReason: '订单已关闭', currentStatus: header, exceptions: [], cascadePreview: [] };
  }
  if (header.order_status === '已完成') {
    return { recordId: purchaseOrderNumber, eligible: false, ineligibleReason: '订单已完成', currentStatus: header, exceptions: [], cascadePreview: [] };
  }
  if (header.approval_status !== '已审批') {
    return { recordId: purchaseOrderNumber, eligible: false, ineligibleReason: '订单未审批，不可关闭', currentStatus: header, exceptions: [], cascadePreview: [] };
  }

  const [details]: any = await sequelize.query(
    `SELECT id, item_number, item_name, order_quantity, received_quantity, receive_status FROM purchase_order_detail WHERE purchase_order_number = :num`,
    { replacements: { num: purchaseOrderNumber } }
  );

  const exceptions: ExceptionItem[] = [];

  // PUR_RECV: 收货异常
  const recvIssues = details.filter((d: any) => d.receive_status !== '已到货');
  if (recvIssues.length > 0) {
    exceptions.push({
      code: 'PUR_RECV', label: '收货异常', description: `${recvIssues.length}行未完成收货`,
      details: recvIssues.map((d: any) => ({ item: d.item_name || d.item_number, receive_status: d.receive_status, received: d.received_quantity, ordered: d.order_quantity })),
    });
  }

  // PUR_QUALITY: 质量异常
  const [qcIssues]: any = await sequelize.query(
    `SELECT inspection_number, item_number, inspect_status FROM purchase_quality_inspection WHERE purchase_order_number = :num AND inspect_status NOT IN (N'已检验', N'已入库')`,
    { replacements: { num: purchaseOrderNumber } }
  );
  if (qcIssues.length > 0) {
    exceptions.push({
      code: 'PUR_QUALITY', label: '质量异常', description: `${qcIssues.length}条检验未完成`,
      details: qcIssues.map((q: any) => ({ inspection_number: q.inspection_number, item: q.item_number, inspect_status: q.inspect_status })),
    });
  }

  // 级联预览
  const cascadePreview: CascadePreview[] = [];
  const [recvNotices]: any = await sequelize.query(
    `SELECT receiving_number FROM purchase_receiving_notice WHERE purchase_order_number = :num AND approval_status = N'待确认'`,
    { replacements: { num: purchaseOrderNumber } }
  );
  if (recvNotices.length > 0) {
    cascadePreview.push({ downstreamType: 'purchase_receiving_notice', count: recvNotices.length, items: recvNotices.map((r: any) => r.receiving_number) });
  }

  return { recordId: purchaseOrderNumber, eligible: true, currentStatus: header, exceptions, cascadePreview };
}

// ==================== 提交关闭申请 ====================

export async function submitManualCloseCore(params: {
  module: string; recordIds: string[]; closeReason: string; closeRemark: string; userId: number; username: string;
}): Promise<BatchResult> {
  const { module, recordIds, closeReason, closeRemark, username } = params;
  const succeeded: string[] = [];
  const failed: Array<{ recordId: string; message: string }> = [];

  // 生成批次号
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const [maxBatch]: any = await sequelize.query(
    `SELECT MAX(batch_group) as max_bg FROM manual_close_log WHERE batch_group LIKE :prefix`,
    { replacements: { prefix: `MC-${dateStr}-%` } }
  );
  let seq = 1;
  if (maxBatch[0]?.max_bg) {
    const lastSeq = parseInt(maxBatch[0].max_bg.split('-').pop() || '0');
    seq = lastSeq + 1;
  }
  const batchGroup = `MC-${dateStr}-${String(seq).padStart(3, '0')}`;

  // 检测异常
  const detectResults = await detectExceptions(module, recordIds);

  for (const dr of detectResults) {
    if (!dr.eligible) {
      failed.push({ recordId: dr.recordId, message: dr.ineligibleReason || '不可关闭' });
      continue;
    }
    try {
      const exceptionCategories = dr.exceptions.map(e => e.code).join(',');
      const exceptionDetail = JSON.stringify(dr.exceptions);
      const cascadePreview = JSON.stringify(dr.cascadePreview);

      await sequelize.query(
        `INSERT INTO manual_close_log (module, record_id, batch_group, exception_categories, exception_detail, close_reason, close_remark, status, submitted_by, submitted_at, cascade_result)
         VALUES (:module, :record_id, :batch_group, :exception_categories, :exception_detail, :close_reason, :close_remark, N'待审批', :submitted_by, GETDATE(), :cascade_result)`,
        {
          replacements: {
            module, record_id: dr.recordId, batch_group: batchGroup,
            exception_categories: exceptionCategories, exception_detail: exceptionDetail,
            close_reason: closeReason, close_remark: closeRemark,
            submitted_by: username, cascade_result: cascadePreview,
          },
        }
      );
      succeeded.push(dr.recordId);
    } catch (e) {
      failed.push({ recordId: dr.recordId, message: (e as Error).message });
    }
  }

  return { succeeded, failed };
}

// ==================== 审批通过 ====================

export async function approveManualCloseCore(params: {
  batchGroup: string; userId: number; username: string; remark?: string;
}): Promise<BatchResult> {
  const { batchGroup, username } = params;
  const succeeded: string[] = [];
  const failed: Array<{ recordId: string; message: string }> = [];

  const [logs]: any = await sequelize.query(
    `SELECT id, module, record_id, close_reason, close_remark FROM manual_close_log WHERE batch_group = :bg AND status = N'待审批'`,
    { replacements: { bg: batchGroup } }
  );

  if (logs.length === 0) {
    return { succeeded: [], failed: [{ recordId: '', message: '无待审批记录' }] };
  }

  for (const logEntry of logs) {
    try {
      const cascadeResult = await withTransaction(async (transaction: any) => {
        // 执行关闭+级联
        const cr = await executeManualCloseCore(logEntry.module, logEntry.record_id, logEntry.close_reason, logEntry.close_remark, username, transaction);

        // 更新 manual_close_log
        await sequelize.query(
          `UPDATE manual_close_log SET status = N'已执行', approved_by = :ab, approved_at = GETDATE(), executed_at = GETDATE(), cascade_result = :cr WHERE id = :id`,
          { replacements: { ab: username, cr: JSON.stringify(cr), id: logEntry.id }, transaction }
        );

        return cr;
      });

      succeeded.push(logEntry.record_id);
    } catch (e) {
      failed.push({ recordId: logEntry.record_id, message: (e as Error).message });
      // 标记该条为失败但不影响其他
      await sequelize.query(
        `UPDATE manual_close_log SET status = N'已拒绝', approved_by = :ab, approved_at = GETDATE(), cascade_result = :cr WHERE id = :id`,
        { replacements: { ab: username, cr: JSON.stringify({ error: (e as Error).message }), id: logEntry.id } }
      );
    }
  }

  return { succeeded, failed };
}

// ==================== 执行关闭+级联 ====================

async function executeManualCloseCore(
  module: string, recordId: string, closeReason: string, closeRemark: string, closedBy: string, transaction: any
): Promise<Record<string, any>> {
  const cascadeResult: Record<string, any> = {};

  switch (module) {
    case 'sales_order': {
      await sequelize.query(
        `UPDATE sales_order SET order_status = N'已取消', close_reason = :cr, close_remark = :crm, force_closed_by = :fb, force_closed_date = GETDATE() WHERE sales_order_number = :id`,
        { replacements: { cr: closeReason, crm: closeRemark, fb: closedBy, id: recordId }, transaction }
      );
      // 明细行作废
      await sequelize.query(
        `UPDATE sales_order_detail SET status = N'已作废' WHERE sales_order_number = :id AND status NOT IN (N'已完成', N'已作废')`,
        { replacements: { id: recordId }, transaction }
      );
      // 级联: 取消发货申请（通过明细表关联）
      const [srResult]: any = await sequelize.query(
        `UPDATE sr SET sr.status = N'已取消' FROM shipping_request sr INNER JOIN shipping_request_detail srd ON sr.request_number = srd.request_number WHERE srd.sales_order_number = :id AND sr.status NOT IN (N'已发货', N'已取消')`,
        { replacements: { id: recordId }, transaction }
      );
      cascadeResult.shippingRequestsCancelled = srResult;
      break;
    }
    case 'production_order': {
      await sequelize.query(
        `UPDATE production_order SET completion_status = N'已关闭', plan_status = N'已关闭', close_reason = :cr, close_remark = :crm, force_closed_by = :fb, force_closed_date = GETDATE() WHERE production_order_number = :id`,
        { replacements: { cr: closeReason, crm: closeRemark, fb: closedBy, id: recordId }, transaction }
      );
      // 级联: 关闭工序任务
      const [taskResult]: any = await sequelize.query(
        `UPDATE process_task SET task_status = N'已关闭' WHERE production_order_number = :id AND task_status NOT IN (N'已完成', N'已关闭')`,
        { replacements: { id: recordId }, transaction }
      );
      cascadeResult.processTasksClosed = taskResult;
      // 级联: 回写销售订单明细生产状态
      await sequelize.query(
        `UPDATE sd SET production_status = N'已关闭'
         FROM sales_order_detail sd
         INNER JOIN Production_plan pp ON pp.source_order_number = sd.sales_order_number AND pp.source_line_number = sd.line_number
         INNER JOIN production_order po ON po.production_number = pp.production_number
         WHERE po.production_order_number = :id AND sd.production_status NOT IN (N'生产完成', N'已关闭')`,
        { replacements: { id: recordId }, transaction }
      );
      break;
    }
    case 'purchase_order': {
      await sequelize.query(
        `UPDATE purchase_order SET order_status = N'已关闭', close_reason = :cr, close_remark = :crm, force_closed_by = :fb, force_closed_date = GETDATE() WHERE purchase_order_number = :id`,
        { replacements: { cr: closeReason, crm: closeRemark, fb: closedBy, id: recordId }, transaction }
      );
      // 明细行关闭
      await sequelize.query(
        `UPDATE purchase_order_detail SET receive_status = N'已关闭' WHERE purchase_order_number = :id AND receive_status NOT IN (N'已到货')`,
        { replacements: { id: recordId }, transaction }
      );
      // 级联: 取消收货通知
      const [rnResult]: any = await sequelize.query(
        `UPDATE purchase_receiving_notice SET approval_status = N'已取消' WHERE purchase_order_number = :id AND approval_status = N'待确认'`,
        { replacements: { id: recordId }, transaction }
      );
      cascadeResult.receivingNoticesCancelled = rnResult;
      break;
    }
  }

  return cascadeResult;
}

// ==================== 拒绝关闭 ====================

export async function rejectManualCloseCore(params: {
  batchGroup: string; userId: number; username: string; remark?: string;
}): Promise<BatchResult> {
  const { batchGroup, username } = params;
  await sequelize.query(
    `UPDATE manual_close_log SET status = N'已拒绝', approved_by = :ab, approved_at = GETDATE() WHERE batch_group = :bg AND status = N'待审批'`,
    { replacements: { ab: username, bg: batchGroup } }
  );
  const [logs]: any = await sequelize.query(
    `SELECT record_id FROM manual_close_log WHERE batch_group = :bg`,
    { replacements: { bg: batchGroup } }
  );
  return { succeeded: logs.map((l: any) => l.record_id), failed: [] };
}

// ==================== 撤回关闭申请 ====================

export async function withdrawManualCloseCore(params: {
  batchGroup: string; userId: number; username: string;
}): Promise<BatchResult> {
  const { batchGroup, username } = params;
  // 仅原提交人可撤回
  const [logs]: any = await sequelize.query(
    `SELECT record_id FROM manual_close_log WHERE batch_group = :bg AND status = N'待审批' AND submitted_by = :sb`,
    { replacements: { bg: batchGroup, sb: username } }
  );
  if (logs.length === 0) {
    return { succeeded: [], failed: [{ recordId: '', message: '无权撤回或无待审批记录' }] };
  }
  await sequelize.query(
    `UPDATE manual_close_log SET status = N'已撤回' WHERE batch_group = :bg AND status = N'待审批' AND submitted_by = :sb`,
    { replacements: { bg: batchGroup, sb: username } }
  );
  return { succeeded: logs.map((l: any) => l.record_id), failed: [] };
}

// ==================== 查询待审批列表 ====================

export async function getPendingManualCloseCore(params: { page?: number; limit?: number } = {}): Promise<any> {
  const page = params.page || 1;
  const limit = params.limit || 20;

  const [countResult]: any = await sequelize.query(
    `SELECT COUNT(DISTINCT batch_group) as total FROM manual_close_log WHERE status = N'待审批'`
  );
  const total = countResult[0].total;

  const offset = (page - 1) * limit;
  // 使用 FOR XML PATH 替代 STRING_AGG（兼容 SQL Server 2012+），使用 ROW_NUMBER 分页替代 OFFSET-FETCH
  const [groups]: any = await sequelize.query(`
    SELECT * FROM (
      SELECT batch_group, module, submitted_by, MIN(submitted_at) as submitted_at,
             STUFF((
               SELECT ',' + CAST(inner_r.record_id AS NVARCHAR(MAX))
               FROM manual_close_log inner_r
               WHERE inner_r.batch_group = outer_r.batch_group AND inner_r.status = N'待审批'
               FOR XML PATH(''), TYPE
             ).value('.', 'NVARCHAR(MAX)'), 1, 1, '') as record_ids,
             STUFF((
               SELECT ',' + CAST(inner_e.exception_categories AS NVARCHAR(MAX))
               FROM manual_close_log inner_e
               WHERE inner_e.batch_group = outer_r.batch_group AND inner_e.status = N'待审批'
               FOR XML PATH(''), TYPE
             ).value('.', 'NVARCHAR(MAX)'), 1, 1, '') as all_exceptions,
             ROW_NUMBER() OVER (ORDER BY MIN(submitted_at) DESC) as rn
      FROM manual_close_log outer_r
      WHERE status = N'待审批'
      GROUP BY batch_group, module, submitted_by
    ) t
    WHERE rn > :offset AND rn <= :offset + :limit
  `, { replacements: { offset, limit } });

  return {
    items: groups,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

// ==================== 获取关闭原因选项 ====================

export function getCloseReasons(module: string): Array<{ code: string; label: string; desc: string }> {
  const prefix = module === 'sales_order' ? 'SO_' : module === 'production_order' ? 'PO_' : 'PUR_';
  return Object.values(CLOSE_REASON)
    .filter((r: any) => r.code.startsWith(prefix))
    .map((r: any) => ({ code: r.code, label: r.label, desc: r.desc }));
}
