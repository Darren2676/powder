import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success, error } from '../../../utils/response.util';

// 获取权限树
export const getPermissionTree = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 获取所有权限
    const allPerms: any = await sequelize.query(
      `SELECT * FROM permission ORDER BY sort_order, id`,
      { type: 'SELECT' }
    );

    // 构建树结构
    const buildTree = (parentId: number | null): any[] => {
      return allPerms
        .filter((p: any) => (parentId === null ? p.parent_id === null : p.parent_id === parentId))
        .map((p: any) => ({
          ...p,
          children: buildTree(p.id)
        }));
    };

    const tree = buildTree(null);
    res.json(success(tree));
  } catch (err) {
    next(err);
  }
};

// 获取所有权限（平铺列表）
export const getAllPermissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows: any = await sequelize.query(
      `SELECT * FROM permission ORDER BY sort_order, id`,
      { type: 'SELECT' }
    );
    res.json(success(rows));
  } catch (err) {
    next(err);
  }
};

// 创建权限
export const createPermission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { permission_name, permission_code, permission_type, parent_id, menu_key, route_path, icon, sort_order } = req.body;

    if (!permission_name || !permission_code || !permission_type) {
      return res.status(400).json(error('权限名称、编码和类型不能为空', 400));
    }

    const existing: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = :code`,
      { replacements: { code: permission_code }, type: 'SELECT' }
    );
    if (existing.length > 0) {
      return res.status(400).json(error('权限编码已存在', 400));
    }

    await sequelize.query(
      `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, icon, sort_order, status)
       VALUES (:name, :code, :type, :parentId, :menuKey, :routePath, :icon, :sort, N'启用')`,
      {
        replacements: {
          name: permission_name,
          code: permission_code,
          type: permission_type,
          parentId: parent_id || null,
          menuKey: menu_key || null,
          routePath: route_path || null,
          icon: icon || null,
          sort: sort_order || 0
        }
      }
    );

    const [newPerm]: any = await sequelize.query(
      `SELECT * FROM permission WHERE permission_code = :code`,
      { replacements: { code: permission_code }, type: 'SELECT' }
    );

    // 自动将新权限分配给admin角色
    if (newPerm) {
      await sequelize.query(
        `INSERT INTO role_permission (role_id, permission_id)
         SELECT r.id, :permId FROM role r WHERE r.role_code = 'admin' AND r.status = N'启用'
         AND NOT EXISTS (
           SELECT 1 FROM role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = :permId
         )`,
        { replacements: { permId: newPerm.id } }
      );
    }

    res.json(success(newPerm, '创建权限成功'));
  } catch (err) {
    next(err);
  }
};

// 更新权限
export const updatePermission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const { permission_name, permission_type, parent_id, menu_key, route_path, icon, sort_order, status } = req.body;

    const perms: any = await sequelize.query(
      `SELECT * FROM permission WHERE id = :id`,
      { replacements: { id }, type: 'SELECT' }
    );
    if (perms.length === 0) {
      return res.status(404).json(error('权限不存在', 404));
    }

    await sequelize.query(
      `UPDATE permission SET
        permission_name = COALESCE(:name, permission_name),
        permission_type = COALESCE(:type, permission_type),
        parent_id = COALESCE(:parentId, parent_id),
        menu_key = COALESCE(:menuKey, menu_key),
        route_path = COALESCE(:routePath, route_path),
        icon = COALESCE(:icon, icon),
        sort_order = COALESCE(:sort, sort_order),
        status = COALESCE(:status, status),
        updated_at = GETDATE()
      WHERE id = :id`,
      {
        replacements: {
          id,
          name: permission_name || null,
          type: permission_type || null,
          parentId: parent_id ?? null,
          menuKey: menu_key || null,
          routePath: route_path || null,
          icon: icon || null,
          sort: sort_order ?? null,
          status: status || null
        }
      }
    );

    const [updated]: any = await sequelize.query(
      `SELECT * FROM permission WHERE id = :id`,
      { replacements: { id }, type: 'SELECT' }
    );

    res.json(success(updated, '更新权限成功'));
  } catch (err) {
    next(err);
  }
};

// 删除权限
export const deletePermission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);

    // 检查是否有子权限
    const [childCount]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM permission WHERE parent_id = :id`,
      { replacements: { id } }
    );
    if (childCount[0].cnt > 0) {
      return res.status(400).json(error('该权限下有子权限，不能删除', 400));
    }

    // 删除角色权限关联
    await sequelize.query(`DELETE FROM role_permission WHERE permission_id = :id`, { replacements: { id } });
    // 删除权限
    await sequelize.query(`DELETE FROM permission WHERE id = :id`, { replacements: { id } });

    res.json(success(null, '删除权限成功'));
  } catch (err) {
    next(err);
  }
};

// 获取当前用户权限列表
export const getMyPermissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json(error('未认证', 401));
    }

    // 检查是否admin
    const [userRoles]: any = await sequelize.query(
      `SELECT r.role_code FROM user_role ur
       INNER JOIN role r ON r.id = ur.role_id
       WHERE ur.user_id = :uid AND r.status = N'启用'`,
      { replacements: { uid: userId } }
    );
    const isAdmin = userRoles.some((r: any) => r.role_code === 'admin');

    let permissions: any[];
    if (isAdmin) {
      // admin获取所有权限
      permissions = await sequelize.query(
        `SELECT DISTINCT p.id, p.permission_name, p.permission_code, p.permission_type,
          p.parent_id, p.menu_key, p.route_path, p.icon, p.sort_order
        FROM permission p
        WHERE p.status = N'启用'
        ORDER BY p.sort_order, p.id`,
        { type: 'SELECT' }
      );
    } else {
      // 查询用户角色对应的权限
      permissions = await sequelize.query(
        `SELECT DISTINCT p.id, p.permission_name, p.permission_code, p.permission_type,
          p.parent_id, p.menu_key, p.route_path, p.icon, p.sort_order
        FROM permission p
        INNER JOIN role_permission rp ON rp.permission_id = p.id
        INNER JOIN user_role ur ON ur.role_id = rp.role_id
        WHERE ur.user_id = :uid AND p.status = N'启用'
        ORDER BY p.sort_order, p.id`,
        { replacements: { uid: userId }, type: 'SELECT' }
      );
    }

    // 构建菜单权限的tree key集合（用于前端菜单过滤）
    const menuKeys: string[] = [];
    const permissionCodes: string[] = [];
    const routePaths: string[] = [];
    // 操作权限集合: { "sales-orders": ["view","create","edit","delete","export","approve"] }
    const operationPermissions: Record<string, string[]> = {};
    // 字段权限集合: { "sales-orders": ["unit_price","total_amount"] }
    const fieldPermissions: Record<string, string[]> = {};

    for (const p of permissions) {
      permissionCodes.push(p.permission_code);
      if (p.menu_key) menuKeys.push(p.menu_key);
      if (p.route_path) routePaths.push(p.route_path);

      // 解析操作权限: 格式为 {page_code}:{action}
      if (p.permission_type === 'operation') {
        const parts = p.permission_code.split(':');
        if (parts.length === 2) {
          const pageCode = parts[0];
          const action = parts[1];
          if (!operationPermissions[pageCode]) operationPermissions[pageCode] = [];
          operationPermissions[pageCode].push(action);
        }
      }

      // 解析字段权限: 格式为 {page_code}:field:{field_name}
      if (p.permission_type === 'field') {
        const parts = p.permission_code.split(':');
        if (parts.length === 3 && parts[1] === 'field') {
          const pageCode = parts[0];
          const fieldName = parts[2];
          if (!fieldPermissions[pageCode]) fieldPermissions[pageCode] = [];
          fieldPermissions[pageCode].push(fieldName);
        }
      }
    }

    res.json(success({
      permissions,
      menuKeys,
      permissionCodes,
      routePaths,
      operationPermissions,
      fieldPermissions,
      isAdmin
    }));
  } catch (err) {
    next(err);
  }
};

// 获取当前用户的菜单树（用于动态侧边栏）
export const getMyMenuTree = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json(error('未认证', 401));
    }

    // 检查是否admin
    const [userRoles]: any = await sequelize.query(
      `SELECT r.role_code FROM user_role ur
       INNER JOIN role r ON r.id = ur.role_id
       WHERE ur.user_id = :uid AND r.status = N'启用'`,
      { replacements: { uid: userId } }
    );
    const isAdmin = userRoles.some((r: any) => r.role_code === 'admin');

    let allPerms: any[];
    if (isAdmin) {
      // admin获取所有权限（排除operation和field类型，它们不出现在菜单树中）
      allPerms = await sequelize.query(
        `SELECT id, permission_name, permission_code, permission_type,
          parent_id, menu_key, route_path, icon, sort_order
        FROM permission WHERE status = N'启用' AND permission_type IN ('menu', 'page')
        ORDER BY sort_order, id`,
        { type: 'SELECT' }
      );
    } else {
      // 非admin获取角色对应的权限（排除operation和field类型）
      allPerms = await sequelize.query(
        `SELECT DISTINCT p.id, p.permission_name, p.permission_code, p.permission_type,
          p.parent_id, p.menu_key, p.route_path, p.icon, p.sort_order
        FROM permission p
        INNER JOIN role_permission rp ON rp.permission_id = p.id
        INNER JOIN user_role ur ON ur.role_id = rp.role_id
        WHERE ur.user_id = :uid AND p.status = N'启用' AND p.permission_type IN ('menu', 'page')
        ORDER BY p.sort_order, p.id`,
        { replacements: { uid: userId }, type: 'SELECT' }
      );
    }

    // 对非admin，需要补充父级menu权限（有子页面权限但缺少父级菜单权限时）
    if (!isAdmin) {
      const permIds = new Set(allPerms.map((p: any) => p.id));
      const allMenus: any = await sequelize.query(
        `SELECT id, permission_name, permission_code, permission_type,
          parent_id, menu_key, route_path, icon, sort_order
        FROM permission WHERE permission_type = 'menu' AND status = N'启用'
        ORDER BY sort_order, id`,
        { type: 'SELECT' }
      );

      // 找出需要补充的父级菜单
      for (const perm of allPerms) {
        if (perm.parent_id && !permIds.has(perm.parent_id)) {
          const parent = allMenus.find((m: any) => m.id === perm.parent_id);
          if (parent) {
            allPerms.push(parent);
            permIds.add(parent.id);
          }
        }
      }
      // 重新排序
      allPerms.sort((a: any, b: any) => a.sort_order - b.sort_order || a.id - b.id);
    }

    // 构建菜单树
    const buildTree = (parentId: number | null): any[] => {
      return allPerms
        .filter((p: any) => (parentId === null ? p.parent_id === null : p.parent_id === parentId))
        .map((p: any) => ({
          key: p.menu_key || p.permission_code,
          name: p.permission_name,
          code: p.permission_code,
          type: p.permission_type,
          icon: p.icon,
          route: p.route_path,
          children: buildTree(p.id)
        }));
    };

    const menuTree = buildTree(null);
    res.json(success(menuTree));
  } catch (err) {
    next(err);
  }
};
