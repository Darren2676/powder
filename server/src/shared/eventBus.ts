/**
 * EventBus - 进程内事件总线
 * 基于 Node.js EventEmitter，支持异步监听器
 *
 * 使用说明：
 * 1. 发布事件：await emitAsync('EventName', payload)
 * 2. 订阅事件：on('EventName', async (payload) => { ... })
 *
 * 注意：emitAsync 会等待所有异步监听器完成，保持事务一致性
 */

import { EventEmitter } from 'events';

const eventBus = new EventEmitter();

/**
 * 异步发布事件，等待所有监听器完成
 * 适用于需要在同一事务中同步执行的场景
 */
export const emitAsync = async (event: string, ...args: any[]): Promise<void> => {
  const listeners = eventBus.listeners(event);
  if (listeners.length === 0) {
    console.warn(`[EventBus] 事件 "${event}" 无监听器`);
    return;
  }
  await Promise.all(listeners.map(listener => listener(...args)));
};

/**
 * 同步发布事件，不等待监听器完成
 * 适用于事务外或允许异步处理的场景
 */
export const emit = (event: string, ...args: any[]): void => {
  eventBus.emit(event, ...args);
};

/**
 * 订阅事件
 */
export const onEvent = (event: string, listener: (...args: any[]) => void | Promise<void>): void => {
  eventBus.on(event, listener as any);
};

/**
 * 取消订阅事件
 */
export const offEvent = (event: string, listener: (...args: any[]) => void | Promise<void>): void => {
  eventBus.off(event, listener as any);
};

/**
 * 一次性订阅事件
 */
export const onceEvent = (event: string, listener: (...args: any[]) => void | Promise<void>): void => {
  eventBus.once(event, listener as any);
};

/**
 * 获取事件监听器数量
 */
export const listenerCount = (event: string): number => {
  return eventBus.listenerCount(event);
};

export default eventBus;
