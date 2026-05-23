import { Request, Response, NextFunction } from 'express';
import { manualTriggerAutoStockCount } from '../../../services/stockCountScheduler.service';
import { success } from '../../../utils/response.util';

export const handleTriggerAutoStockCount = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await manualTriggerAutoStockCount();
    res.json(success(result, result.triggered ? '执行完成' : '未满足执行条件'));
  } catch (err) { next(err); }
};
