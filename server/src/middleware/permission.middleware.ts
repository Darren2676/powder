import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { createLogger } from '@/config/logger';

const log = createLogger('permission');

/**
 * 基于权限码的中间件
 * 用法: requirePermission('system') 或 requirePermission('sales-orders')
 * 检查当前用户的角色是否拥有指定权限码对应的权限
 */
export const requirePermission = (permissionCode: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: '未认证的用户'
        });
      }

      const userId = (req as any).user.id;

      // admin角色的用户始终有权限
      const [userRoles]: any = await sequelize.query(
        `SELECT r.role_code FROM user_role ur
         INNER JOIN role r ON r.id = ur.role_id
         WHERE ur.user_id = :uid AND r.status = N'启用'`,
        { replacements: { uid: userId } }
      );

      const roleCodes = userRoles.map((r: any) => r.role_code);
      if (roleCodes.includes('admin')) {
        return next();
      }

      // 检查用户是否有该权限
      const [permRows]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM permission p
         INNER JOIN role_permission rp ON rp.permission_id = p.id
         INNER JOIN user_role ur ON ur.role_id = rp.role_id
         WHERE ur.user_id = :uid AND p.permission_code = :code AND p.status = N'启用'`,
        { replacements: { uid: userId, code: permissionCode } }
      );

      if (permRows[0].cnt > 0) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: '没有权限访问此资源'
      });
    } catch (err) {
      log.error({ err, permissionCode, userId: req.user?.id }, 'Permission check error');
      return res.status(500).json({
        success: false,
        message: '权限校验异常'
      });
    }
  };
};

/**
 * 基于菜单key的中间件
 * 用法: requireMenuKey('users')
 * 检查当前用户角色是否拥有指定菜单key对应的页面权限
 */
export const requireMenuKey = (menuKey: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: '未认证的用户'
        });
      }

      const userId = (req as any).user.id;

      // admin角色的用户始终有权限
      const [userRoles]: any = await sequelize.query(
        `SELECT r.role_code FROM user_role ur
         INNER JOIN role r ON r.id = ur.role_id
         WHERE ur.user_id = :uid AND r.status = N'启用'`,
        { replacements: { uid: userId } }
      );

      const roleCodes = userRoles.map((r: any) => r.role_code);
      if (roleCodes.includes('admin')) {
        return next();
      }

      // 检查用户是否有该菜单key权限
      const [permRows]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM permission p
         INNER JOIN role_permission rp ON rp.permission_id = p.id
         INNER JOIN user_role ur ON ur.role_id = rp.role_id
         WHERE ur.user_id = :uid AND p.menu_key = :menuKey AND p.status = N'启用'`,
        { replacements: { uid: userId, menuKey } }
      );

      if (permRows[0].cnt > 0) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: '没有权限访问此页面'
      });
    } catch (err) {
      log.error({ err, menuKey, userId: req.user?.id }, 'MenuKey check error');
      return res.status(500).json({
        success: false,
        message: '权限校验异常'
      });
    }
  };
};

/**
 * 基于操作权限的中间件
 * 用法: requireOperation('sales-orders', 'edit') 或 requireOperation('sales-orders', 'delete')
 * 检查当前用户角色是否拥有指定页面的指定操作权限
 * 权限编码格式: {pageCode}:{action}  例如 sales-orders:edit
 */
export const requireOperation = (pageCode: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: '未认证的用户'
        });
      }

      const userId = (req as any).user.id;

      // admin角色的用户始终有权限
      const [userRoles]: any = await sequelize.query(
        `SELECT r.role_code FROM user_role ur
         INNER JOIN role r ON r.id = ur.role_id
         WHERE ur.user_id = :uid AND r.status = N'启用'`,
        { replacements: { uid: userId } }
      );

      const roleCodes = userRoles.map((r: any) => r.role_code);
      if (roleCodes.includes('admin')) {
        return next();
      }

      // 检查用户是否有该操作权限
      const operationCode = `${pageCode}:${action}`;
      const [permRows]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM permission p
         INNER JOIN role_permission rp ON rp.permission_id = p.id
         INNER JOIN user_role ur ON ur.role_id = rp.role_id
         WHERE ur.user_id = :uid AND p.permission_code = :code AND p.permission_type = N'operation' AND p.status = N'启用'`,
        { replacements: { uid: userId, code: operationCode } }
      );

      if (permRows[0].cnt > 0) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: `没有${action === 'view' ? '查看' : action === 'create' ? '新增' : action === 'edit' ? '编辑' : action === 'delete' ? '删除' : action === 'approve' ? '审批' : action === 'export' ? '导出' : action === 'import' ? '导入' : action}权限`
      });
    } catch (err) {
      log.error({ err, pageCode, action, userId: req.user?.id }, 'Operation check error');
      return res.status(500).json({
        success: false,
        message: '权限校验异常'
      });
    }
  };
};
