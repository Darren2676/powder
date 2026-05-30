import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import {
  APPROVAL_STATUS,
  CLAIM_TYPES,
  EXPENSE_CATEGORIES,
  generateClaimNumber,
  validateStatusTransition,
  refreshClaimAmounts,
  createApprovalSteps,
  resetApprovalSteps,
  getCurrentStep,
  advanceApproval,
} from './expenseClaim.service';
import { submitForApprovalCore, approveCore, withdrawCore, reverseApprovalCore } from '../../../services/approval.service';

// ==================== 辅助：根据 id 或 claim_number 查找报销单 ====================
async function findClaimByIdParam(idParam: string): Promise<{ id: number; claim_number: string; approval_status: string; [key: string]: any } | null> {
  const isNumericId = /^\d+$/.test(idParam);
  const whereClause = isNumericId
    ? 'SELECT * FROM expense_claim WHERE id = :id'
    : 'SELECT * FROM expense_claim WHERE claim_number = :id';
  const [rows]: any = await sequelize.query(whereClause, { replacements: { id: idParam } });
  return rows.length ? rows[0] : null;
}

// ==================== 列表 ====================
export const getExpenseClaims = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = (req.query.approval_status as string) || '';
    const claimType = (req.query.claim_type as string) || '';
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const replacements: any = { offset, offsetEnd: offset + limit };

    if (search) {
      conditions.push('(claim_number LIKE :search OR applicant_name LIKE :search OR purpose LIKE :search)');
      replacements.search = `%${search}%`;
    }
    if (status) { conditions.push('approval_status = :status'); replacements.status = status; }
    if (claimType) { conditions.push('claim_type = :ct'); replacements.ct = claimType; }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) AS total FROM expense_claim ${whereClause}`, { replacements }
    );
    const [items]: any = await sequelize.query(
      `SELECT * FROM (
         SELECT *, ROW_NUMBER() OVER (ORDER BY created_at DESC, id DESC) AS _row_num
         FROM expense_claim ${whereClause}
       ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items: cleanItems,
      pagination: { total: countResult[0]?.total || 0, page, limit, totalPages: Math.ceil((countResult[0]?.total || 0) / limit) },
    }));
  } catch (err) { next(err); }
};

// ==================== 字典 ====================
export const getClaimTypes = async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(success({ claim_types: CLAIM_TYPES, expense_categories: EXPENSE_CATEGORIES })); }
  catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getExpenseClaimDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const isNumericId = /^\d+$/.test(id);
    const whereClause = isNumericId
      ? 'SELECT * FROM expense_claim WHERE id = :id'
      : 'SELECT * FROM expense_claim WHERE claim_number = :id';
    const [headers]: any = await sequelize.query(whereClause, { replacements: { id } });
    if (!headers.length) { res.status(404).json({ success: false, message: '报销单不存在' }); return; }

    const cn = headers[0].claim_number;
    const [items]: any = await sequelize.query(
      'SELECT * FROM expense_claim_item WHERE claim_number = :cn ORDER BY sort_order, id', { replacements: { cn } }
    );
    const [steps]: any = await sequelize.query(
      'SELECT * FROM expense_claim_approval_step WHERE claim_number = :cn ORDER BY step_number', { replacements: { cn } }
    );
    const [attachments]: any = await sequelize.query(
      'SELECT * FROM expense_claim_attachment WHERE claim_number = :cn ORDER BY uploaded_at', { replacements: { cn } }
    );

    // 修复已有的乱码文件名（UTF-8被当做Latin1存储的情况）
    for (const att of attachments) {
      try {
        const buf = Buffer.from(att.file_name, 'latin1');
        const fixed = buf.toString('utf-8');
        if (/[\u4e00-\u9fff]/.test(fixed) && fixed !== att.file_name) {
          att.file_name = fixed;
          // 异步修复数据库
          sequelize.query(
            'UPDATE expense_claim_attachment SET file_name = :fname WHERE id = :id',
            { replacements: { fname: fixed, id: att.id } }
          ).catch(() => {});
        }
      } catch {}
    }

    // 查询工作流实例及审批历史（如果存在）
    let workflowInstance: any = null;
    try {
      const [instances]: any = await sequelize.query(`
        SELECT i.*, d.name as definition_name
        FROM workflow_instances i
        LEFT JOIN workflow_definitions d ON i.definition_id = d.id
        WHERE i.module = 'expense_claim' AND i.record_id = :cn
        ORDER BY i.id DESC
      `, { replacements: { cn } });
      if (instances.length > 0) {
        const inst = instances[0];
        // 查询待办任务
        const [tasks]: any = await sequelize.query(`
          SELECT id, node_name, assignee_id, assignee_name, status, created_at
          FROM workflow_tasks WHERE instance_id = :iid AND status = N'pending'
        `, { replacements: { iid: inst.id } });
        inst.pending_tasks = tasks;
        // 查询审批历史
        const [history]: any = await sequelize.query(`
          SELECT * FROM workflow_history WHERE instance_id = :iid ORDER BY created_at ASC
        `, { replacements: { iid: inst.id } });
        inst.history = history;
        workflowInstance = inst;
      }
    } catch {} // 工作流表可能不存在，忽略错误

    res.json(success({ header: headers[0], items, steps, attachments, workflowInstance }));
  } catch (err) { next(err); }
};

// ==================== 新建 ====================
export const createExpenseClaim = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body || {};
    const user = (req as any).user;
    const username = user?.username || '';
    const userId = user?.id || null;

    if (!b.claim_type) { res.status(400).json({ success: false, message: '报销类型必填' }); return; }

    const transaction = await sequelize.transaction();
    try {
      const claimNumber = await generateClaimNumber(transaction);
      await sequelize.query(
        `INSERT INTO expense_claim
          (claim_number, claim_date, claim_type, applicant_id, applicant_name, department,
           purpose, advance_amount, remark, created_by, updated_by)
         VALUES (:cn, :date, :type, :aid, :aname, :dept, :purpose, :advance, :remark, :cb, :cb)`,
        {
          replacements: {
            cn: claimNumber, date: b.claim_date || dayjsDate(), type: b.claim_type,
            aid: userId, aname: username, dept: b.department || null,
            purpose: b.purpose || null, advance: b.advance_amount || 0,
            remark: b.remark || null, cb: username,
          },
          transaction,
        }
      );

      // 插入明细
      if (Array.isArray(b.items) && b.items.length > 0) {
        for (let i = 0; i < b.items.length; i++) {
          const it = b.items[i];
          await sequelize.query(
            `INSERT INTO expense_claim_item
              (claim_number, expense_category, trip_from, trip_to, trip_start_date, trip_end_date,
               vehicle_type, receipt_count, person_count, days, subsidy_rate, amount, item_remark, sort_order)
             VALUES (:cn, :cat, :from, :to, :sd, :ed, :vt, :rc, :pc, :d, :sr, :amt, :ir, :so)`,
            {
              replacements: {
                cn: claimNumber, cat: it.expense_category, from: it.trip_from || null, to: it.trip_to || null,
                sd: it.trip_start_date || null, ed: it.trip_end_date || null, vt: it.vehicle_type || null,
                rc: it.receipt_count || 0, pc: it.person_count || 1, d: it.days || 0,
                sr: it.subsidy_rate || 0, amt: it.amount || 0, ir: it.item_remark || null, so: i,
              },
              transaction,
            }
          );
        }
      }

      await refreshClaimAmounts(claimNumber, transaction);

      // 插入审批步骤（如果前端传了）
      if (Array.isArray(b.approval_steps) && b.approval_steps.length > 0) {
        await createApprovalSteps(claimNumber, b.approval_steps.map((s: any, idx: number) => ({
          step_number: idx + 1, step_name: s.step_name, approver_id: s.approver_id, approver_name: s.approver_name,
        })), transaction);
      }

      await transaction.commit();
      res.json(success({ id: claimNumber }, '创建成功'));
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ==================== 编辑（仅草稿/已驳回） ====================
export const updateExpenseClaim = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const b = req.body || {};
    const username = (req as any).user?.username || '';

    const claim = await findClaimByIdParam(id);
    if (!claim) { res.status(404).json({ success: false, message: '报销单不存在' }); return; }
    if (!['草稿', '已驳回'].includes(claim.approval_status)) {
      res.status(400).json({ success: false, message: '仅草稿或已驳回状态可编辑' }); return;
    }

    const cn = claim.claim_number;
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `UPDATE expense_claim SET claim_type = :type, department = :dept, purpose = :purpose,
            advance_amount = :advance, remark = :remark, updated_by = :ub, updated_at = GETDATE()
          WHERE claim_number = :cn`,
        { replacements: { cn, type: b.claim_type || (claim as any).claim_type, dept: b.department || (claim as any).department || null, purpose: b.purpose || (claim as any).purpose || null, advance: b.advance_amount ?? (claim as any).advance_amount ?? 0, remark: b.remark || (claim as any).remark || null, ub: username }, transaction }
      );

      // 重写明细
      if (Array.isArray(b.items)) {
        await sequelize.query('DELETE FROM expense_claim_item WHERE claim_number = :cn', { replacements: { cn }, transaction });
        for (let i = 0; i < b.items.length; i++) {
          const it = b.items[i];
          await sequelize.query(
            `INSERT INTO expense_claim_item
              (claim_number, expense_category, trip_from, trip_to, trip_start_date, trip_end_date,
               vehicle_type, receipt_count, person_count, days, subsidy_rate, amount, item_remark, sort_order)
             VALUES (:cn, :cat, :from, :to, :sd, :ed, :vt, :rc, :pc, :d, :sr, :amt, :ir, :so)`,
            {
              replacements: {
                cn, cat: it.expense_category, from: it.trip_from || null, to: it.trip_to || null,
                sd: it.trip_start_date || null, ed: it.trip_end_date || null, vt: it.vehicle_type || null,
                rc: it.receipt_count || 0, pc: it.person_count || 1, d: it.days || 0,
                sr: it.subsidy_rate || 0, amt: it.amount || 0, ir: it.item_remark || null, so: i,
              },
              transaction,
            }
          );
        }
        await refreshClaimAmounts(cn, transaction);
      }

      // 重写审批步骤
      if (Array.isArray(b.approval_steps) && b.approval_steps.length > 0) {
        await createApprovalSteps(cn, b.approval_steps.map((s: any, idx: number) => ({
          step_number: idx + 1, step_name: s.step_name, approver_id: s.approver_id, approver_name: s.approver_name,
        })), transaction);
      }

      await transaction.commit();
      res.json(success(null, '更新成功'));
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ==================== 删除（仅草稿） ====================
export const deleteExpenseClaim = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const claim = await findClaimByIdParam(id);
    if (!claim) { res.status(404).json({ success: false, message: '报销单不存在' }); return; }
    if (claim.approval_status !== '草稿') { res.status(400).json({ success: false, message: '仅草稿可删除' }); return; }
    await sequelize.query('DELETE FROM expense_claim WHERE id = :id', { replacements: { id: claim.id } });
    res.json(success(null, '删除成功'));
  } catch (err) { next(err); }
};

// ==================== 提交审批 ====================
export const submitExpenseClaim = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;
    const claim = await findClaimByIdParam(id);
    if (!claim) { res.status(404).json({ success: false, message: '报销单不存在' }); return; }
    if (!validateStatusTransition(claim.approval_status, 'submit')) {
      res.status(400).json({ success: false, message: `当前状态 ${claim.approval_status} 不可提交` }); return;
    }

    const cn = claim.claim_number;

    // 走统一审批入口（submitForApprovalCore 内部自动根据 hasActiveWorkflow 分流）
    try {
      const result = await submitForApprovalCore({
        module: 'expense_claim', recordId: cn, userId: user.id, username: user.username, remark: req.body?.remark,
      });
      if (result.usedWorkflow) {
        res.json(success({ instanceId: result.instanceId }, '提交审批成功（工作流）'));
      } else {
        res.json(success(null, '提交审批成功'));
      }
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json({ success: false, message: err.message }); return;
      }
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 审批通过 ====================
export const approveExpenseClaim = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;
    const claim = await findClaimByIdParam(id);
    if (!claim) { res.status(404).json({ success: false, message: '报销单不存在' }); return; }

    const cn = claim.claim_number;

    // 双模式：检查是否有工作流实例
    const [wfInstances]: any = await sequelize.query(
      `SELECT TOP 1 id FROM workflow_instances WHERE module = 'expense_claim' AND record_id = :cn AND status = N'running' ORDER BY id DESC`,
      { replacements: { cn } }
    );
    if (wfInstances.length > 0) {
      res.status(400).json({ success: false, message: '该报销单已进入工作流审批，请在流程管理-我的待办中操作' }); return;
    }

    // 回退：走统一简易审批（无工作流实例时，manager/admin 直接审批通过）
    try {
      await approveCore({
        module: 'expense_claim',
        recordId: cn,
        userId: user.id,
        username: user.username,
        remark: req.body?.remark,
      });
      res.json(success(null, '审批通过'));
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json({ success: false, message: err.message }); return;
      }
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 驳回 ====================
export const rejectExpenseClaim = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;
    const claim = await findClaimByIdParam(id);
    if (!claim) { res.status(404).json({ success: false, message: '报销单不存在' }); return; }

    const cn = claim.claim_number;

    // 双模式：检查是否有工作流实例
    const [wfInstances]: any = await sequelize.query(
      `SELECT TOP 1 id FROM workflow_instances WHERE module = 'expense_claim' AND record_id = :cn AND status = N'running' ORDER BY id DESC`,
      { replacements: { cn } }
    );
    if (wfInstances.length > 0) {
      res.status(400).json({ success: false, message: '该报销单已进入工作流审批，请在流程管理-我的待办中操作' }); return;
    }

    // 回退：走统一简易审批驳回（无工作流实例时，manager/admin 直接驳回）
    if (!validateStatusTransition(claim.approval_status, 'reject')) {
      res.status(400).json({ success: false, message: '当前状态不可驳回' }); return;
    }
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `UPDATE expense_claim SET approval_status = N'已驳回', updated_by = :ub, updated_at = GETDATE() WHERE claim_number = :cn AND approval_status = N'待审批'`,
        { replacements: { cn, ub: user.username }, transaction }
      );
      const [check]: any = await sequelize.query(
        'SELECT approval_status FROM expense_claim WHERE claim_number = :cn', { replacements: { cn }, transaction }
      );
      if (!check.length || check[0].approval_status !== '已驳回') {
        res.status(400).json({ success: false, message: '驳回失败，当前状态可能不是待审批' }); await transaction.rollback(); return;
      }
      await sequelize.query(
        `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark)
         VALUES ('expense_claim', :cn, 'reject', N'待审批', N'已驳回', :uid, :uname, :remark)`,
        { replacements: { cn, uid: user.id, uname: user.username, remark: req.body?.remark || '驳回' }, transaction }
      );
      await transaction.commit();
      res.json(success(null, '已驳回'));
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ==================== 撤回 ====================
export const withdrawExpenseClaim = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;

    const claim = await findClaimByIdParam(id);
    if (!claim) { res.status(404).json({ success: false, message: '报销单不存在' }); return; }

    const cn = claim.claim_number;
    const [wfInstances]: any = await sequelize.query(
      `SELECT TOP 1 id FROM workflow_instances WHERE module = 'expense_claim' AND record_id = :cn AND status = N'running' ORDER BY id DESC`,
      { replacements: { cn } }
    );
    if (wfInstances.length > 0) {
      res.status(400).json({ success: false, message: '该报销单已进入工作流审批，请在流程管理中撤回' }); return;
    }

    // 回退：走统一简易审批撤回
    try {
      await withdrawCore({
        module: 'expense_claim',
        recordId: cn,
        userId: user.id,
        username: user.username,
      });
      res.json(success(null, '已撤回'));
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json({ success: false, message: err.message }); return;
      }
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 反审 ====================
export const reverseExpenseClaim = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;
    const claim = await findClaimByIdParam(id);
    if (!claim) { res.status(404).json({ success: false, message: '报销单不存在' }); return; }
    if (!validateStatusTransition(claim.approval_status, 'reverse')) {
      res.status(400).json({ success: false, message: '仅已审批可反审' }); return;
    }

    const cn = claim.claim_number;

    // 双模式：走统一反审入口（已包含工作流实例状态同步）
    try {
      await reverseApprovalCore({
        module: 'expense_claim',
        recordId: cn,
        userId: user.id,
        username: user.username,
        remark: req.body?.remark,
      });
      res.json(success(null, '反审成功'));
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json({ success: false, message: err.message }); return;
      }
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 上传附件 ====================
export const uploadAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const file = req.file as any;
    if (!file) { res.status(400).json({ success: false, message: '请选择文件' }); return; }

    const claim = await findClaimByIdParam(id);
    if (!claim) { res.status(404).json({ success: false, message: '报销单不存在' }); return; }

    const username = (req as any).user?.username || '';
    const cn = claim.claim_number;
    // 修复中文文件名编码：multer 的 originalname 可能是 latin1 编码，需转为 utf-8
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf-8');
    await sequelize.query(
      `INSERT INTO expense_claim_attachment (claim_number, file_name, file_url, file_size, uploaded_by)
       VALUES (:cn, :fname, :furl, :fsize, :ub)`,
      { replacements: { cn, fname: originalName, furl: `/uploads/${file.filename}`, fsize: file.size, ub: username } }
    );
    res.json(success(null, '上传成功'));
  } catch (err) { next(err); }
};

// ==================== 删除附件 ====================
export const deleteAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attachId } = req.params;
    const [rows]: any = await sequelize.query('SELECT id FROM expense_claim_attachment WHERE id = :id', { replacements: { id: attachId } });
    if (!rows.length) { res.status(404).json({ success: false, message: '附件不存在' }); return; }
    await sequelize.query('DELETE FROM expense_claim_attachment WHERE id = :id', { replacements: { id: attachId } });
    res.json(success(null, '删除成功'));
  } catch (err) { next(err); }
};

// ==================== 辅助 ====================
function dayjsDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
