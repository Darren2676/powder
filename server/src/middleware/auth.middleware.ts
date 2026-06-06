import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.util';
import { User } from '../models';
import { getAccessibleFactories, applyFactoryScope } from './factoryScope.middleware';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query && req.query.token) {
      // 支持 URL query 参数传递 token（用于打印等新标签页场景）
      token = req.query.token as string;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未提供认证令牌'
      });
    }
    
    try {
      const decoded = verifyToken(token);
      
      const user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: '用户不存在'
        });
      }

      if (user.status !== 'active') {
        return res.status(401).json({
          success: false,
          message: '用户已被禁用'
        });
      }

      // 从 JWT 或数据库获取 factory_id
      const factoryId = decoded.factory_id || (user as any).default_factory_id || null;

      // 获取用户可访问的工厂列表（用于顶部切换器）
      let accessibleFactories: any[] = [];
      try {
        const factoryIds = await getAccessibleFactories(user.id);
        if (factoryIds.length > 0) {
          const { sequelize } = require('../models');
          const { QueryTypes } = require('sequelize');
          accessibleFactories = await sequelize.query(
            'SELECT id, factory_code, factory_name, factory_short FROM factory WHERE id IN (:ids) ORDER BY id',
            { replacements: { ids: factoryIds }, type: QueryTypes.SELECT }
          );
        }
      } catch (e) {
        // 工厂表可能尚未创建（首次启动）
      }

      req.user = {
        id: user.id,
        username: user.username,
        real_name: (user as any).real_name || '',
        role: user.role,
        default_factory_id: factoryId,
        accessibleFactories
      };

      // 自动设置工厂数据隔离作用域
      applyFactoryScope(req);

      // 自动注入 factory_id 到请求体（POST/PUT/PATCH 写操作）
      const scope = (req as any).factoryScope;
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && scope && scope.filter && scope.factory_id != null && scope.mode !== 'all') {
        // 跳过不需要注入的路径（认证、用户设置、健康检查、开放接口等）
        const skipPaths = ['/auth/', '/profile', '/password', '/switch', '/list', '/health', '/open/'];
        const shouldSkip = skipPaths.some(p => req.path.includes(p));
        if (!shouldSkip && req.body.factory_id === undefined) {
          req.body.factory_id = scope.factory_id;
        }
      }

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: '无效的认证令牌'
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: '认证过程发生错误'
    });
  }
};
