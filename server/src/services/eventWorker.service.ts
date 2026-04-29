/**
 * 事件消费 Worker (Phase 2)
 * 轮询消费 system_events 表中的 pending 事件
 *
 * 使用方式：
 * 1. 注册处理器：registerEventHandler('EventName', async (payload) => { ... })
 * 2. 启动 Worker：startEventWorker()
 * 3. 发布持久化事件：await saveEvent('EventName', payload) （或业务代码直接调用）
 */

import {
  getPendingEvents,
  markEventProcessing,
  markEventCompleted,
  markEventFailed,
  cleanCompletedEvents,
  type EventStoreRecord,
} from './eventStore.service';
import { createLogger } from '@/config/logger';

const log = createLogger('eventWorker');

// 事件处理器注册表
const eventHandlers = new Map<string, (payload: any) => Promise<void>>();

/**
 * 注册事件处理器
 */
export const registerEventHandler = (eventName: string, handler: (payload: any) => Promise<void>): void => {
  eventHandlers.set(eventName, handler);
  log.info({ eventName }, '处理器已注册');
};

/**
 * 处理单条事件
 */
const processEvent = async (record: EventStoreRecord): Promise<void> => {
  const handler = eventHandlers.get(record.event_name);
  if (!handler) {
    throw new Error(`未找到事件处理器: ${record.event_name}`);
  }

  let payload: any;
  try {
    payload = JSON.parse(record.payload);
  } catch {
    payload = record.payload;
  }

  await handler(payload);
};

/**
 * 执行一轮事件消费
 */
const processPendingEvents = async (): Promise<{ processed: number; failed: number }> => {
  const events = await getPendingEvents(50);
  if (events.length === 0) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await markEventProcessing(event.id!);
      await processEvent(event);
      await markEventCompleted(event.id!);
      processed++;
    } catch (error: any) {
      await markEventFailed(event.id!, error?.message || String(error));
      failed++;
      log.error({ eventName: event.event_name, eventId: event.id, error }, '事件处理失败');
    }
  }

  return { processed, failed };
};

// Worker 状态
let workerIntervalId: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * 启动事件消费 Worker
 * @param intervalMs 轮询间隔，默认 5000ms
 */
export const startEventWorker = (intervalMs: number = 5000): void => {
  if (isRunning) {
    log.warn('Worker 已在运行中');
    return;
  }

  isRunning = true;
  log.info({ intervalMs }, 'EventWorker 已启动');

  // 立即执行一次
  processPendingEvents().then(({ processed, failed }) => {
    if (processed > 0 || failed > 0) {
      log.info({ processed, failed }, '首轮处理完成');
    }
  });

  workerIntervalId = setInterval(async () => {
    try {
      const { processed, failed } = await processPendingEvents();
      if (processed > 0 || failed > 0) {
        log.info({ processed, failed }, '本轮处理完成');
      }
    } catch (error) {
      log.error({ error }, '轮询异常');
    }
  }, intervalMs);
};

/**
 * 停止事件消费 Worker
 */
export const stopEventWorker = (): void => {
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
  }
  isRunning = false;
  log.info('EventWorker 已停止');
};

/**
 * 获取 Worker 运行状态
 */
export const isEventWorkerRunning = (): boolean => isRunning;

/**
 * 手动触发一次事件清理（删除 30 天前的已完成事件）
 */
export const runEventCleanup = async (): Promise<void> => {
  const count = await cleanCompletedEvents(30);
  if (count > 0) {
    log.info({ count }, '清理完成事件');
  }
};

/**
 * 将 EventBus 的订阅者桥接到 EventWorker
 * 当业务需要持久化保证时，可注册到 Worker 而非 EventBus
 */
export const bridgeEventBusToWorker = (eventName: string, handler: (payload: any) => Promise<void>): void => {
  registerEventHandler(eventName, handler);
};
