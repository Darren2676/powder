import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@/config/logger';

const log = createLogger('error');

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  log.error({
    err,
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    userId: req.user?.id,
  }, `未处理异常: ${err.message}`);

  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      message: '数据验证失败',
      errors: err.errors.map((e: any) => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      success: false,
      message: '数据已存在',
      errors: err.errors.map((e: any) => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      success: false,
      message: '关联数据不存在'
    });
  }

  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: '文件大小超过限制'
      });
    }
    return res.status(400).json({
      success: false,
      message: '文件上传失败: ' + err.message
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || '服务器内部错误';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
