/**
 * Pino 结构化日志配置
 * 替代 console.log，提供：
 * 1. 结构化 JSON 日志输出
 * 2. 日志级别控制（debug/info/warn/error/fatal）
 * 3. 请求追踪（requestId）
 * 4. 开发环境美化输出（pino-pretty）
 * 5. 生产环境 JSON 格式输出
 */
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  // 开发环境使用 pino-pretty 美化输出
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l', ignore: 'pid,hostname' } }
    : undefined,
  // 基础字段
  base: {
    service: 'seals-mes',
    env: process.env.NODE_ENV || 'development',
  },
  // 时间戳格式
  timestamp: pino.stdTimeFunctions.isoTime,
  // 自定义日志级别标签
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

/**
 * 创建带模块标识的子日志器
 * 用法: const log = createLogger('workReport');
 *       log.info({ taskNo: 'PT001' }, '工序任务同步完成');
 */
export const createLogger = (module: string) => {
  return logger.child({ module });
};

export default logger;
