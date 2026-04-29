/**
 * SSE 推送路由
 * GET /api/sse/stream - 建立SSE连接（需认证）
 * GET /api/sse/status - 获取SSE服务状态（需认证）
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { addConnection, startHeartbeat, getOnlineUserCount, getTotalConnectionCount } from '../../../services/sse.service';

const router = Router();

/**
 * SSE 连接端点
 * 客户端通过 EventSource('/api/sse/stream') 建立连接
 * 认证通过 URL query 参数 ?token=xxx 传递（因 EventSource 不支持自定义 Header）
 */
router.get('/stream', async (req: Request, res: Response) => {
  // 尝试从 query 或 header 获取 token 认证
  // 由于 EventSource 不支持自定义 header，允许 query token
  const token = req.query.token as string || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ message: '未提供认证令牌' });
  }

  // 验证 token（复用 auth middleware 的逻辑）
  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    if (!decoded?.id) {
      return res.status(401).json({ message: '无效的认证令牌' });
    }

    const userId = decoded.id;

    // 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx 禁用缓冲
    });

    // 发送初始连接成功事件
    res.write(`event: connected\ndata: ${JSON.stringify({ userId, timestamp: Date.now() })}\n\n`);

    // 注册连接
    addConnection(userId, res);
    startHeartbeat();

    // 保持连接打开
    req.on('close', () => {
      // 连接关闭时在 addConnection 的 close 回调中清理
    });
  } catch (e) {
    return res.status(401).json({ message: '认证令牌验证失败' });
  }
});

/**
 * SSE 服务状态端点
 */
router.get('/status', authenticate, (_req: Request, res: Response) => {
  res.json({
    onlineUsers: getOnlineUserCount(),
    totalConnections: getTotalConnectionCount(),
  });
});

export default router;
