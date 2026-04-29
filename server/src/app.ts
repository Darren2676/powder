import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/requestLogger.middleware';
import path from 'path';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import { errorHandler } from './middleware/error.middleware';
import { registerTaskCompletionSubscriber } from './services/subscribers/taskCompletion.subscriber';
import { registerLinesideMovementSubscriber } from './services/subscribers/linesideMovement.subscriber';
import { registerProductionInspectionSubscriber } from './modules/quality/productionInspection/subscriber';
import { startEventWorker } from './services/eventWorker.service';
import sequelize from './config/database';

dotenv.config();

const app = express();

// ==================== CORS 配置 ====================
const corsOrigin = process.env.CORS_ORIGIN; // 生产环境设置如: http://mes.company.com,http://app.company.com
app.use(cors({
  origin: corsOrigin ? corsOrigin.split(',').map(s => s.trim()) : true, // 未配置时全开(开发环境)，配置后仅允许指定Origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(requestLogger);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== 速率限制 ====================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟窗口
  max: 500,                  // 每IP最多500次请求
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: '请求过于频繁，请稍后再试' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟窗口
  max: 20,                   // 登录接口每IP最多20次
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: '登录尝试过于频繁，请稍后再试' }
});

// ==================== API 版本化 ====================
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth/login`, authLimiter);
app.use(API_PREFIX, apiLimiter);

const uploadDir = process.env.UPLOAD_DIR || 'uploads';
app.use('/uploads', express.static(path.join(process.cwd(), uploadDir)));

// ==================== 健康检查端点 ====================
app.get(`${API_PREFIX}/health`, async (_req, res) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  let dbStatus = 'ok';
  try {
    await sequelize.authenticate();
  } catch {
    dbStatus = 'error';
  }
  res.status(dbStatus === 'ok' ? 200 : 503).json({
    status: dbStatus === 'ok' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    database: dbStatus,
    memory: {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
    }
  });
});

app.use(API_PREFIX, routes);

// ==================== 注册事件订阅者 ====================
registerTaskCompletionSubscriber();
registerLinesideMovementSubscriber();
registerProductionInspectionSubscriber();

// ==================== 启动事件消费 Worker (Phase 2) ====================
startEventWorker(10000);

// 提供前端静态文件
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// SPA 路由回退：所有非 API/uploads 请求返回 index.html
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  } else {
    next();
  }
});

app.use(errorHandler);

export default app;
