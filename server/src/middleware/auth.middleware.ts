import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.util';
import { User } from '../models';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '未提供认证令牌'
      });
    }

    const token = authHeader.substring(7);
    
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

      req.user = {
        id: user.id,
        username: user.username,
        real_name: (user as any).real_name || '',
        role: user.role
      };

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
