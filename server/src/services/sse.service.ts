/**
 * SSE (Server-Sent Events) 推送服务
 * 用于 APP 端实时接收通知推送
 * 
 * 设计要点：
 * 1. 每个用户连接维护一个 Response 对象
 * 2. 心跳保活（每30秒发送注释行）
 * 3. 连接断开时自动清理
 * 4. 支持按用户ID定向推送
 */
import { Response } from 'express';
import { EventEmitter } from 'events';

// SSE 事件类型
export interface SSEEvent {
  type: 'notification' | 'approval' | 'task_update' | 'system';
  data: any;
}

// 用户连接映射：userId -> Response[]
const userConnections = new Map<number, Set<Response>>();

// 全局事件总线
export const sseEventBus = new EventEmitter();
sseEventBus.setMaxListeners(200); // 支持较多并发连接

/**
 * 添加用户SSE连接
 */
export const addConnection = (userId: number, res: Response): void => {
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  userConnections.get(userId)!.add(res);

  // 监听该用户的事件
  const handler = (event: SSEEvent) => {
    try {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    } catch (e) {
      // 写入失败，连接已断开
      removeConnection(userId, res);
    }
  };

  // 使用 userId 作为事件名
  sseEventBus.on(`user:${userId}`, handler);

  // 连接断开时清理
  res.on('close', () => {
    removeConnection(userId, res);
    sseEventBus.off(`user:${userId}`, handler);
  });
};

/**
 * 移除用户SSE连接
 */
export const removeConnection = (userId: number, res: Response): void => {
  const connections = userConnections.get(userId);
  if (connections) {
    connections.delete(res);
    if (connections.size === 0) {
      userConnections.delete(userId);
    }
  }
};

/**
 * 向指定用户推送事件
 */
export const pushToUser = (userId: number, event: SSEEvent): void => {
  sseEventBus.emit(`user:${userId}`, event);
};

/**
 * 向所有在线用户广播事件
 */
export const broadcast = (event: SSEEvent): void => {
  for (const userId of userConnections.keys()) {
    pushToUser(userId, event);
  }
};

/**
 * 获取在线用户数
 */
export const getOnlineUserCount = (): number => {
  return userConnections.size;
};

/**
 * 获取总连接数
 */
export const getTotalConnectionCount = (): number => {
  let count = 0;
  for (const connections of userConnections.values()) {
    count += connections.size;
  }
  return count;
};

/**
 * 启动心跳（每30秒向所有连接发送注释行保持连接活跃）
 */
let heartbeatInterval: NodeJS.Timeout | null = null;

export const startHeartbeat = (): void => {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    for (const connections of userConnections.values()) {
      for (const res of connections) {
        try {
          res.write(':heartbeat\n\n'); // SSE注释行，客户端忽略
        } catch (e) {
          // 连接已断开，会在 close 事件中清理
        }
      }
    }
  }, 30000);
};

export const stopHeartbeat = (): void => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};
