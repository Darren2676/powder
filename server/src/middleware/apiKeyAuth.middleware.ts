import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import sequelize from '../config/database';

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      apiKey?: any;
    }
  }
}

export const apiKeyAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKeyValue = req.headers['x-api-key'] as string;

    if (!apiKeyValue) {
      return res.status(401).json({ success: false, message: '缺少API密钥，请在请求头 X-API-Key 中提供' });
    }

    // 查询 api_key 记录
    const [rows]: any = await sequelize.query(
      `SELECT * FROM api_key WHERE api_key = :ak AND is_active = 1`,
      { replacements: { ak: apiKeyValue } }
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: '无效的API密钥' });
    }

    const keyRecord = rows[0];

    // 检查是否过期
    if (keyRecord.expires_at) {
      const expiresAt = new Date(keyRecord.expires_at);
      if (expiresAt < new Date()) {
        return res.status(401).json({ success: false, message: 'API密钥已过期' });
      }
    }

    // 检查IP白名单
    if (keyRecord.allowed_ips) {
      const clientIp = req.ip || req.socket.remoteAddress || '';
      const allowedIps = keyRecord.allowed_ips.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (allowedIps.length > 0 && !allowedIps.includes(clientIp) && !allowedIps.includes('*')) {
        return res.status(403).json({ success: false, message: 'IP地址不在白名单中' });
      }
    }

    // 挂载到 req
    req.apiKey = keyRecord;

    // 更新最后使用时间（异步，不阻塞请求）
    sequelize.query(
      `UPDATE api_key SET last_used_at = GETDATE() WHERE id = :id`,
      { replacements: { id: keyRecord.id } }
    ).catch(() => {});

    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'API密钥验证失败' });
  }
};

// 生成API Key
export const generateApiKeyValue = (): { apiKey: string; secretHash: string } => {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const apiKey = `sk-${randomBytes}`;
  const secretHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  return { apiKey, secretHash };
};

// 记录API调用日志（异步）
export const logApiKeyUsage = (apiKeyId: number, req: Request, statusCode: number, responseTime: number) => {
  sequelize.query(
    `INSERT INTO api_key_usage_log (api_key_id, endpoint, method, status_code, ip_address, user_agent, response_time)
     VALUES (:apiKeyId, :endpoint, :method, :statusCode, :ip, :ua, :rt)`,
    {
      replacements: {
        apiKeyId,
        endpoint: req.originalUrl?.substring(0, 200) || '',
        method: req.method,
        statusCode,
        ip: (req.ip || '').substring(0, 45),
        ua: (req.headers['user-agent'] || '').substring(0, 500),
        rt: responseTime
      }
    }
  ).catch(() => {});
};
