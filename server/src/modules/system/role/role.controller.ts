import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success, error, paginate } from '../../../utils/response.util';

// 获取角色列表
export const getRoles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);

    let whereSql = 'WHERE 1=1';
    const replacements: any = {};

    if (status) {
      whereSql += ' AND r.status = :status';
      replacements.status = status;
    }
    if (search) {
      whereSql += ' AND (r.role_name LIKE :search OR r.role_code LIKE :search)';
      replacements.search = `%${search}%`;
    }

    const countResult: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM role r ${whereSql}`,
      { replacements, type: 'SELECT' }
    );
    const total = countResult[0].cnt;

    // 用 ROW_NUMBER 分页（兼容SQL Server 2008+）
    const rows: any = await sequelize.query(
      `SELECT * FROM (
        SELECT r.*,
          (SELECT COUNT(*) FROM user_role ur WHERE ur.role_id = r.id) as user_count,
          (SELECT COUNT(*) FROM role_permission rp WHERE rp.role_id = r.id) as permission_count,
          ROW_NUMBER() OVER (ORDER BY r.sort_order, r.id) as _rownum
        FROM role r ${whereSql}
      ) t WHERE _rownum BETWEEN :start AND :end`,
      { replacements: { ...replacements, start: (pageNum - 1) * limitNum + 1, end: pageNum * limitNum }, type: 'SELECT' }
    );

    // 移除 _rownum 字段
    const cleanRows = rows.map((r: any) => {
      const { _rownum, ...rest } = r;
      return rest;
    });

    res.json(paginate(cleanRows, total, pageNum, limitNum));
  } catch (err) {
    next(err);
  }
};

// 获取所有角色（不分页，用于下拉选择）
export const getAllRoles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows: any = await sequelize.query(
      `SELECT id, role_name, role_code, status FROM role WHERE status = N'启用' ORDER BY sort_order, id`,
      { type: 'SELECT' }
    );
    res.json(success(rows));
  } catch (err) {
    next(err);
  }
};

// 获取角色详情（含权限列表）
export const getRoleById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const roles: any = await sequelize.query(
      `SELECT * FROM role WHERE id = :id`,
      { replacements: { id }, type: 'SELECT' }
    );
    if (roles.length === 0) {
      return res.status(404).json(error('角色不存在', 404));
    }

    const permissions: any = await sequelize.query(
      `SELECT p.* FROM permission p
       INNER JOIN role_permission rp ON rp.permission_id = p.id
       WHERE rp.role_id = :id
       ORDER BY p.sort_order, p.id`,
      { replacements: { id }, type: 'SELECT' }
    );

    res.json(success({ ...roles[0], permissions }));
  } catch (err) {
    next(err);
  }
};

// 创建角色
export const createRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role_name, role_code, description, sort_order } = req.body;

    if (!role_name || !role_code) {
      return res.status(400).json(error('角色名称和编码不能为空', 400));
    }

    // 检查编码唯一
    const existing: any = await sequelize.query(
      `SELECT id FROM role WHERE role_code = :code`,
      { replacements: { code: role_code }, type: 'SELECT' }
    );
    if (existing.length > 0) {
      return res.status(400).json(error('角色编码已存在', 400));
    }

    await sequelize.query(
      `INSERT INTO role (role_name, role_code, description, is_system, status, sort_order)
       VALUES (:name, :code, :desc, 0, N'启用', :sort)`,
      { replacements: { name: role_name, code: role_code, desc: description || null, sort: sort_order || 0 } }
    );

    const [newRole]: any = await sequelize.query(
      `SELECT * FROM role WHERE role_code = :code`,
      { replacements: { code: role_code }, type: 'SELECT' }
    );

    res.json(success(newRole, '创建角色成功'));
  } catch (err) {
    next(err);
  }
};

// 更新角色
export const updateRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const { role_name, description, status, sort_order } = req.body;

    const roles: any = await sequelize.query(
      `SELECT * FROM role WHERE id = :id`,
      { replacements: { id }, type: 'SELECT' }
    );
    if (roles.length === 0) {
      return res.status(404).json(error('角色不存在', 404));
    }

    if (roles[0].is_system && status === '禁用') {
      return res.status(400).json(error('系统角色不能禁用', 400));
    }

    await sequelize.query(
      `UPDATE role SET
        role_name = COALESCE(:name, role_name),
        description = COALESCE(:desc, description),
        status = COALESCE(:status, status),
        sort_order = COALESCE(:sort, sort_order),
        updated_at = GETDATE()
      WHERE id = :id`,
      { replacements: { id, name: role_name || null, desc: description || null, status: status || null, sort: sort_order ?? null } }
    );

    const [updated]: any = await sequelize.query(
      `SELECT * FROM role WHERE id = :id`,
      { replacements: { id }, type: 'SELECT' }
    );

    res.json(success(updated, '更新角色成功'));
  } catch (err) {
    next(err);
  }
};

// 删除角色
export const deleteRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);

    const roles: any = await sequelize.query(
      `SELECT * FROM role WHERE id = :id`,
      { replacements: { id }, type: 'SELECT' }
    );
    if (roles.length === 0) {
      return res.status(404).json(error('角色不存在', 404));
    }

    if (roles[0].is_system) {
      return res.status(400).json(error('系统角色不能删除', 400));
    }

    // 检查是否有关联用户
    const [urCount]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM user_role WHERE role_id = :id`,
      { replacements: { id } }
    );
    if (urCount[0].cnt > 0) {
      return res.status(400).json(error('该角色下还有用户，不能删除', 400));
    }

    // 删除角色权限关联
    await sequelize.query(`DELETE FROM role_permission WHERE role_id = :id`, { replacements: { id } });
    // 删除角色
    await sequelize.query(`DELETE FROM role WHERE id = :id`, { replacements: { id } });

    res.json(success(null, '删除角色成功'));
  } catch (err) {
    next(err);
  }
};

// 分配权限给角色
export const assignPermissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const { permission_ids } = req.body;

    if (!Array.isArray(permission_ids)) {
      return res.status(400).json(error('permission_ids 必须是数组', 400));
    }

    const roles: any = await sequelize.query(
      `SELECT * FROM role WHERE id = :id`,
      { replacements: { id }, type: 'SELECT' }
    );
    if (roles.length === 0) {
      return res.status(404).json(error('角色不存在', 404));
    }

    // 删除原有权限
    await sequelize.query(`DELETE FROM role_permission WHERE role_id = :id`, { replacements: { id } });

    // 批量插入新权限
    for (const pid of permission_ids) {
      await sequelize.query(
        `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
        { replacements: { rid: id, pid } }
      );
    }

    res.json(success(null, '权限分配成功'));
  } catch (err) {
    next(err);
  }
};
