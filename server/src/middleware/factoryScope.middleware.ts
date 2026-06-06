import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

/**
 * 多工厂数据隔离中间件
 * 
 * 三种模式：
 * 1. 'all'    — 总部角色，查看全部工厂数据（请求头 x-view-mode: all）
 * 2. 'single' — 限定单工厂（默认模式，自动注入 users.default_factory_id）
 * 3. 'none'   — 白名单路由，不使用工厂隔离（如登录、健康检查等）
 */

// 总部角色列表
const HQ_ROLES = [
  'admin',
  'headquarters_admin',
  'headquarters_manager',
  'headquarters_finance',
  'headquarters_quality',
  'headquarters_sales'
];

// 判断是否为总部角色
export function isHQRole(role: string): boolean {
  return HQ_ROLES.includes(role);
}

// 验证用户是否有某工厂的访问权限
async function hasFactoryAccess(userId: number, factoryId: number): Promise<boolean> {
  const rows = await sequelize.query(
    'SELECT 1 FROM user_factory_access WHERE user_id = :uid AND factory_id = :fid',
    { replacements: { uid: userId, fid: factoryId }, type: QueryTypes.SELECT }
  );
  return rows.length > 0;
}

// 获取用户可访问的工厂列表
export async function getAccessibleFactories(userId: number): Promise<number[]> {
  const rows = await sequelize.query(
    'SELECT factory_id FROM user_factory_access WHERE user_id = :uid',
    { replacements: { uid: userId }, type: QueryTypes.SELECT }
  );
  return rows.map((r: any) => r.factory_id);
}

/**
 * 同步设置 factoryScope（供 auth.middleware 调用，不依赖异步中间件链）
 */
export function applyFactoryScope(req: Request): void {
  if (!req.user) return;

  const user = req.user as any;

  // 模式1: 总部角色 + 选择了"全部工厂"视图
  if (isHQRole(user.role) && req.headers['x-view-mode'] === 'all') {
    (req as any).factoryScope = {
      mode: 'all',
      filter: false,
      accessibleFactories: []
    };
    return;
  }

  // 模式2: 总部角色/多工厂用户 + 选择了特定工厂
  if (req.headers['x-factory-id']) {
    const targetFactoryId = parseInt(req.headers['x-factory-id'] as string, 10);
    if (isNaN(targetFactoryId)) return;

    (req as any).factoryScope = {
      mode: 'single',
      factory_id: targetFactoryId,
      filter: true
    };
    return;
  }

  // 模式3: 默认 — 使用用户绑定的默认工厂
  const factoryId = user.default_factory_id || null;

  (req as any).factoryScope = {
    mode: 'single',
    factory_id: factoryId,
    filter: factoryId !== null
  };
}

export const factoryScope = async (req: Request, res: Response, next: NextFunction) => {
  // 如果请求没有 user 信息（未认证），跳过
  if (!req.user) {
    return next();
  }

  const user = req.user as any;

  // 模式1: 总部角色 + 选择了"全部工厂"视图
  if (isHQRole(user.role) && req.headers['x-view-mode'] === 'all') {
    applyFactoryScope(req);
    return next();
  }

  // 模式2: 总部角色/多工厂用户 + 选择了特定工厂
  if (req.headers['x-factory-id']) {
    const targetFactoryId = parseInt(req.headers['x-factory-id'] as string, 10);
    if (isNaN(targetFactoryId)) {
      return next();
    }

    // 总部角色直接放行；普通用户需验证权限
    if (!isHQRole(user.role)) {
      const hasAccess = await hasFactoryAccess(user.id, targetFactoryId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: '无权限访问该工厂'
        });
      }
    }

    applyFactoryScope(req);
    return next();
  }

  // 模式3: 默认 — 使用用户绑定的默认工厂
  applyFactoryScope(req);
  next();
};
