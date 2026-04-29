/**
 * 请求日志中间件
 * 使用 Pino 结构化日志替代 morgan，统一日志格式
 * 记录每个请求的：方法、路径、状态码、响应时间、用户ID
 */
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@/config/logger';

const log = createLogger('http');

// 扩展 Request 类型以包含 requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = uuidv4();
  req.requestId = requestId;

  // 记录请求开始
  log.info({
    requestId,
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    userId: req.user?.id,
    ip: req.ip,
  }, `${req.method} ${req.path}`);

  // 响应完成后记录耗时和状态码
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    log[level]({
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id,
    }, `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });

  next();
};
