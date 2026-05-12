import { Request, Response, NextFunction } from 'express';
import { success } from '../../../utils/response.util';
import {
  getAllConfigs,
  getConfigByType,
  updateConfig,
  resetConfig,
  clearConfigCache,
} from '@/services/documentAutoComplete.service';

/** 获取所有单据自动完成配置 */
export const getAllDocumentCompletionConfigs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configs = await getAllConfigs();
    res.json(success(configs, '获取配置成功'));
  } catch (err) { next(err); }
};

/** 获取指定类型的配置 */
export const getDocumentCompletionConfigByType = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = req.params.type as string;
    const config = await getConfigByType(type);
    if (!config) {
      res.status(404).json({ success: false, message: '配置不存在' });
      return;
    }
    res.json(success(config, '获取配置成功'));
  } catch (err) { next(err); }
};

/** 更新配置 */
export const updateDocumentCompletionConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = req.params.type as string;
    const updatedBy = (req as any).user?.username || '';
    await updateConfig(type, { ...req.body, updated_by: updatedBy });
    clearConfigCache();
    res.json(success(null, '更新配置成功'));
  } catch (err) { next(err); }
};

/** 重置配置为默认值 */
export const resetDocumentCompletionConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = req.params.type as string;
    const updatedBy = (req as any).user?.username || '';
    await resetConfig(type, updatedBy);
    res.json(success(null, '重置配置成功'));
  } catch (err) { next(err); }
};
