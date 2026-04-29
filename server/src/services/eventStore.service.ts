/**
 * 事件持久化服务 (Phase 2)
 * 将领域事件持久化到 system_events 表，支持失败重试和死信队列
 *
 * 使用场景：
 * 1. 跨模块事件需要保证不丢失（如库存更新、财务记账）
 * 2. 异步处理失败后可重试
 * 3. 审计追踪
 */

import sequelize from '@/config/database';

export interface EventStoreRecord {
  id?: number;
  event_type: string;
  event_name: string;
  payload: string;
  status: 'pending' | 'processing' | 'completed' | 'dead';
  retry_count: number;
  error_message?: string;
  created_at?: Date;
  processed_at?: Date;
}

/**
 * 保存事件到数据库
 */
export const saveEvent = async (
  eventName: string,
  payload: any,
  eventType: string = 'domain'
): Promise<number> => {
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const [result]: any = await sequelize.query(
    `INSERT INTO system_events (event_type, event_name, payload, status, retry_count, created_at)
     OUTPUT INSERTED.id
     VALUES (:eventType, :eventName, :payload, N'pending', 0, GETDATE())`,
    {
      replacements: { eventType, eventName, payload: payloadStr },
    }
  );
  return result[0]?.id;
};

/**
 * 批量保存事件
 */
export const saveEvents = async (
  events: Array<{ eventName: string; payload: any; eventType?: string }>
): Promise<number[]> => {
  const ids: number[] = [];
  for (const event of events) {
    const id = await saveEvent(event.eventName, event.payload, event.eventType || 'domain');
    ids.push(id);
  }
  return ids;
};

/**
 * 获取待处理的事件（批量）
 */
export const getPendingEvents = async (limit: number = 50): Promise<EventStoreRecord[]> => {
  const [rows]: any = await sequelize.query(
    `SELECT TOP :limit * FROM system_events
     WHERE status = N'pending'
       AND (retry_count < 3 OR retry_count IS NULL)
     ORDER BY created_at ASC`,
    { replacements: { limit } }
  );
  return rows || [];
};

/**
 * 标记事件为处理中
 */
export const markEventProcessing = async (id: number): Promise<void> => {
  await sequelize.query(
    `UPDATE system_events SET status = N'processing' WHERE id = :id`,
    { replacements: { id } }
  );
};

/**
 * 标记事件为已完成
 */
export const markEventCompleted = async (id: number): Promise<void> => {
  await sequelize.query(
    `UPDATE system_events SET status = N'completed', processed_at = GETDATE() WHERE id = :id`,
    { replacements: { id } }
  );
};

/**
 * 标记事件为失败（增加重试计数）
 * 超过 3 次自动进入死信状态
 */
export const markEventFailed = async (id: number, errorMessage: string): Promise<void> => {
  await sequelize.query(
    `UPDATE system_events
     SET retry_count = retry_count + 1,
         error_message = :errorMessage,
         status = CASE WHEN retry_count + 1 >= 3 THEN N'dead' ELSE N'pending' END
     WHERE id = :id`,
    { replacements: { id, errorMessage: errorMessage?.substring(0, 4000) || '' } }
  );
};

/**
 * 获取死信事件（用于监控和告警）
 */
export const getDeadEvents = async (limit: number = 50): Promise<EventStoreRecord[]> => {
  const [rows]: any = await sequelize.query(
    `SELECT TOP :limit * FROM system_events WHERE status = N'dead' ORDER BY created_at DESC`,
    { replacements: { limit } }
  );
  return rows || [];
};

/**
 * 手动重试死信事件
 */
export const retryDeadEvent = async (id: number): Promise<void> => {
  await sequelize.query(
    `UPDATE system_events SET status = N'pending', retry_count = 0, error_message = NULL WHERE id = :id`,
    { replacements: { id } }
  );
};

/**
 * 清理已完成的事件（保留 30 天）
 */
export const cleanCompletedEvents = async (days: number = 30): Promise<number> => {
  const [result]: any = await sequelize.query(
    `DELETE FROM system_events WHERE status = N'completed' AND created_at < DATEADD(day, -:days, GETDATE())`,
    { replacements: { days } }
  );
  return result?.[0]?.affectedRows || 0;
};
