import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { BusinessError } from '@/shared/errors/BusinessError';
import { getFactoryId } from '../../../utils/factoryWhere.util';
import {
  submitForApprovalCore,
  approveCore,
  reverseApprovalCore,
  withdrawCore,
  batchSubmitCore,
  batchApproveCore,
  batchWithdrawCore,
  batchReverseCore,
  getPendingApprovalsCore,
} from '../../../services/approval.service';

// ==================== Submit for Approval ====================
export const submitForApproval = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const user = (req as any).user;

    const result = await submitForApprovalCore({
      module: b.module,
      recordId: b.record_id,
      userId: user.id,
      username: user.username,
      remark: b.remark,
      factory_id: getFactoryId(req) ?? undefined,
    });

    if (result.usedWorkflow) {
      res.json(success({ instanceId: result.instanceId }, '提交审批成功（工作流）'));
    } else {
      res.json(success(null, '提交审批成功'));
    }
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== Approve ====================
export const approve = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const user = (req as any).user;

    await approveCore({
      module: b.module,
      recordId: b.record_id,
      userId: user.id,
      username: user.username,
      remark: b.remark,
      factory_id: getFactoryId(req) ?? undefined,
    });

    res.json(success(null, '审批通过'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== Reverse Approval ====================
export const reverseApproval = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const user = (req as any).user;

    await reverseApprovalCore({
      module: b.module,
      recordId: b.record_id,
      userId: user.id,
      username: user.username,
      remark: b.remark,
      factory_id: getFactoryId(req) ?? undefined,
    });

    res.json(success(null, '反审成功，已退回草稿'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== Withdraw ====================
export const withdraw = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const user = (req as any).user;

    await withdrawCore({
      module: b.module,
      recordId: b.record_id,
      userId: user.id,
      username: user.username,
      factory_id: getFactoryId(req) ?? undefined,
    });

    res.json(success(null, '撤回成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== Get Approval Log ====================
export const getApprovalLog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const module = req.query.module as string;
    const record_id = req.query.record_id as string;
    if (!module || !record_id) { res.status(400).json({ success: false, message: '缺少module或record_id参数' }); return; }

    const [logs]: any = await sequelize.query(
      `SELECT * FROM approval_log WHERE module = :module AND record_id = :record_id ORDER BY created_at DESC`,
      { replacements: { module, record_id } }
    );
    res.json(success(logs, '获取审批历史成功'));
  } catch (err) { next(err); }
};

// ==================== Batch Operations ====================

/** 批量提交审批 (草稿 → 待审批) */
export const batchSubmit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const user = (req as any).user;

    const results = await batchSubmitCore({
      module: b.module,
      recordIds: b.record_ids,
      userId: user.id,
      username: user.username,
      factory_id: getFactoryId(req) ?? undefined,
    });

    res.json(success(results, `批量提交完成：成功 ${results.succeeded.length} 条，失败 ${results.failed.length} 条`));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

/** 批量审批通过 (待审批 → 已审批) */
export const batchApprove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const user = (req as any).user;

    const results = await batchApproveCore({
      module: b.module,
      recordIds: b.record_ids,
      userId: user.id,
      username: user.username,
      factory_id: getFactoryId(req) ?? undefined,
    });

    res.json(success(results, `批量审批完成：成功 ${results.succeeded.length} 条，失败 ${results.failed.length} 条`));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

/** 批量撤回 (待审批 → 草稿) */
export const batchWithdraw = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const user = (req as any).user;

    const results = await batchWithdrawCore({
      module: b.module,
      recordIds: b.record_ids,
      userId: user.id,
      username: user.username,
      factory_id: getFactoryId(req) ?? undefined,
    });

    res.json(success(results, `批量撤回完成：成功 ${results.succeeded.length} 条，失败 ${results.failed.length} 条`));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

/** 批量反审 (已审批 → 草稿) */
export const batchReverse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const user = (req as any).user;

    const results = await batchReverseCore({
      module: b.module,
      recordIds: b.record_ids,
      userId: user.id,
      username: user.username,
      factory_id: getFactoryId(req) ?? undefined,
    });

    res.json(success(results, `批量反审完成：成功 ${results.succeeded.length} 条，失败 ${results.failed.length} 条`));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 获取审批待办列表 ====================
export const getPendingApprovals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const statusFilter = (req.query.status as string) || 'pending';

    const result = await getPendingApprovalsCore({ page, limit, statusFilter, factory_id: getFactoryId(req) ?? undefined });

    res.json(success(result, '获取审批待办成功'));
  } catch (err) { next(err); }
};
