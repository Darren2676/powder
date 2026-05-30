import { Request, Response, NextFunction } from 'express';

/**
 * 数据范围中间件：为 sales 角色用户自动追加 head_of_sales_id 过滤条件
 * 
 * 使用方式：在路由中紧跟 authenticate 之后添加
 *   router.get('/', authenticate, dataScope, getCustomers)
 * 
 * 中间件逻辑：
 * - sales 角色 → req.dataScope = { head_of_sales_id: req.user.id }
 * - 其他角色 → req.dataScope = null（不限制）
 */
export const dataScope = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: '未认证的用户'
    });
  }

  if (req.user.role === 'sales') {
    (req as any).dataScope = {
      head_of_sales_id: req.user.id
    };
  } else {
    (req as any).dataScope = null;
  }

  next();
};
