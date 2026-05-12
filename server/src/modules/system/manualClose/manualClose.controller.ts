import { Request, Response, NextFunction } from 'express';
import { success } from '../../../utils/response.util';
import {
  detectExceptions,
  submitManualCloseCore,
  approveManualCloseCore,
  rejectManualCloseCore,
  withdrawManualCloseCore,
  getPendingManualCloseCore,
  getCloseReasons,
} from '@/services/manualClose.service';

/** 异常检测 */
export const handleDetectExceptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { module, record_ids } = req.body;
    if (!module || !record_ids?.length) {
      res.status(400).json({ success: false, message: '缺少参数' });
      return;
    }
    const results = await detectExceptions(module, record_ids);
    res.json(success(results, '异常检测完成'));
  } catch (err) { next(err); }
};

/** 提交关闭申请 */
export const handleSubmitManualClose = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { module, record_ids, close_reason, close_remark } = req.body;
    const user = (req as any).user;
    const results = await submitManualCloseCore({
      module, recordIds: record_ids, closeReason: close_reason, closeRemark: close_remark || '',
      userId: user?.id, username: user?.username || '',
    });
    res.json(success(results, `提交完成：成功 ${results.succeeded.length}，失败 ${results.failed.length}`));
  } catch (err) { next(err); }
};

/** 审批通过 */
export const handleApproveManualClose = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { batch_group, remark } = req.body;
    const user = (req as any).user;
    const results = await approveManualCloseCore({
      batchGroup: batch_group, userId: user?.id, username: user?.username || '', remark,
    });
    res.json(success(results, `审批完成：成功 ${results.succeeded.length}，失败 ${results.failed.length}`));
  } catch (err) { next(err); }
};

/** 拒绝关闭 */
export const handleRejectManualClose = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { batch_group, remark } = req.body;
    const user = (req as any).user;
    const results = await rejectManualCloseCore({
      batchGroup: batch_group, userId: user?.id, username: user?.username || '', remark,
    });
    res.json(success(results, '已拒绝'));
  } catch (err) { next(err); }
};

/** 撤回申请 */
export const handleWithdrawManualClose = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { batch_group } = req.body;
    const user = (req as any).user;
    const results = await withdrawManualCloseCore({
      batchGroup: batch_group, userId: user?.id, username: user?.username || '',
    });
    res.json(success(results, '已撤回'));
  } catch (err) { next(err); }
};

/** 获取待审批列表 */
export const handleGetPendingManualCloses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const results = await getPendingManualCloseCore({ page, limit });
    res.json(success(results, '获取待审批列表成功'));
  } catch (err) { next(err); }
};

/** 获取关闭原因选项 */
export const handleGetCloseReasons = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const module = req.params.module as string;
    const reasons = getCloseReasons(module);
    res.json(success(reasons, '获取关闭原因选项成功'));
  } catch (err) { next(err); }
};
