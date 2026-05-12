import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'ticket-system-jwt-secret-key-2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export const generateToken = (payload: object): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
};

export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('无效的令牌');
  }
};

// 验证token是否可刷新（过期但在刷新窗口内）
export const verifyRefreshableToken = (token: string): any => {
  try {
    // 先尝试正常验证（token可能还没过期）
    return jwt.verify(token, JWT_SECRET);
  } catch (error: any) {
    // token过期，检查是否在刷新窗口内
    if (error.name === 'TokenExpiredError') {
      try {
        const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as any;
        const now = Math.floor(Date.now() / 1000);
        const expiredAt = decoded.exp;
        const refreshWindow = parseDuration(JWT_REFRESH_EXPIRES_IN);
        if (now - expiredAt <= refreshWindow) {
          return decoded;
        }
        throw new Error('刷新窗口已过期，请重新登录');
      } catch (e: any) {
        throw new Error(e.message || '令牌刷新失败');
      }
    }
    throw new Error('无效的令牌');
  }
};

// 将持续时间字符串(如'24h', '7d')转换为秒数
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 86400; // 默认1天
  const value = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 86400;
  }
}
