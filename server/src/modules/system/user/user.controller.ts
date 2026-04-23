import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { User } from '../../../models';
import sequelize from '../../../config/database';
import { success, error, paginate } from '../../../utils/response.util';
import { hashPassword } from '../../../utils/password.util';

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 10, status, role, search } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (role) where.role = role;
    if (search) {
      where.username = {
        [Op.like]: `%${search}%`
      };
    }

    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password'] },
      limit: Number(limit),
      offset,
      order: [['created_at', 'DESC']]
    });

    // 附加每个用户的角色信息
    const userIds = rows.map((u: any) => u.id);
    let userRolesMap: any = {};

    if (userIds.length > 0) {
      const userRoles: any = await sequelize.query(
        `SELECT ur.user_id, r.id as role_id, r.role_name, r.role_code
         FROM user_role ur
         INNER JOIN role r ON r.id = ur.role_id
         WHERE ur.user_id IN (:uids)`,
        { replacements: { uids: userIds }, type: 'SELECT' }
      );
      for (const ur of userRoles) {
        if (!userRolesMap[ur.user_id]) userRolesMap[ur.user_id] = [];
        userRolesMap[ur.user_id].push({ role_id: ur.role_id, role_name: ur.role_name, role_code: ur.role_code });
      }
    }

    const enrichedRows = rows.map((u: any) => ({
      ...u.toJSON(),
      roles: userRolesMap[u.id] || []
    }));

    res.json(paginate(enrichedRows, count, Number(page), Number(limit)));
  } catch (err) {
    next(err);
  }
};

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;

    if (!b.username || !b.password) {
      return res.status(400).json(error('用户名和密码不能为空', 400));
    }

    if (!b.phone) {
      return res.status(400).json(error('手机号不能为空', 400));
    }

    const existingUser = await User.findOne({ where: { username: b.username } });
    if (existingUser) {
      return res.status(400).json(error('用户名已存在', 400));
    }

    if (b.email) {
      const existingEmail = await User.findOne({ where: { email: b.email } });
      if (existingEmail) {
        return res.status(400).json(error('邮箱已被使用', 400));
      }
    }

    const hashedPassword = await hashPassword(b.password);
    const user = await User.create({
      username: b.username,
      password: hashedPassword,
      email: b.email || null,
      real_name: b.real_name || '',
      role: b.role || 'staff',
      department: b.department || '',
      employee_number: b.employee_number || '',
      employee_name: b.employee_name || '',
      phone: b.phone || '',
      status: b.status || 'active'
    });

    // 分配角色到user_role表
    if (b.role_ids && Array.isArray(b.role_ids) && b.role_ids.length > 0) {
      for (const rid of b.role_ids) {
        await sequelize.query(
          `INSERT INTO user_role (user_id, role_id) VALUES (:uid, :rid)`,
          { replacements: { uid: user.id, rid } }
        );
      }
    } else if (b.role) {
      // 兼容旧逻辑：根据role字段自动分配
      const [roleRows]: any = await sequelize.query(
        `SELECT id FROM role WHERE role_code = :code`,
        { replacements: { code: b.role } }
      );
      if (roleRows.length > 0) {
        await sequelize.query(
          `INSERT INTO user_role (user_id, role_id) VALUES (:uid, :rid)`,
          { replacements: { uid: user.id, rid: roleRows[0].id } }
        );
      }
    }

    const newUser = await User.findByPk(user.id, {
      attributes: { exclude: ['password'] }
    });

    res.json(success(newUser, '创建用户成功'));
  } catch (err) {
    next(err);
  }
};

export const getUserById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);

    const user = await User.findByPk(id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    // 获取用户角色
    const roles: any = await sequelize.query(
      `SELECT r.id as role_id, r.role_name, r.role_code
       FROM user_role ur
       INNER JOIN role r ON r.id = ur.role_id
       WHERE ur.user_id = :uid`,
      { replacements: { uid: id }, type: 'SELECT' }
    );

    res.json(success({ ...user.toJSON(), roles }));
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    if (b.username && b.username !== user.username) {
      const existingUser = await User.findOne({ where: { username: b.username } });
      if (existingUser) {
        return res.status(400).json(error('用户名已存在', 400));
      }
      user.username = b.username;
    }

    if (b.email && b.email !== user.email) {
      const existingEmail = await User.findOne({ where: { email: b.email } });
      if (existingEmail) {
        return res.status(400).json(error('邮箱已被使用', 400));
      }
      user.email = b.email;
    }

    if (b.real_name !== undefined) user.real_name = b.real_name;
    if (b.department !== undefined) user.department = b.department;
    if (b.employee_number !== undefined) user.employee_number = b.employee_number;
    if (b.employee_name !== undefined) user.employee_name = b.employee_name;
    if (b.phone !== undefined) user.phone = b.phone;
    if (b.avatar !== undefined) user.avatar = b.avatar;
    if (b.status !== undefined) user.status = b.status;

    // 更新旧role字段（兼容）
    if (b.role !== undefined) user.role = b.role;

    await user.save();

    // 更新用户角色关联
    if (b.role_ids && Array.isArray(b.role_ids)) {
      await sequelize.query(`DELETE FROM user_role WHERE user_id = :uid`, { replacements: { uid: id } });
      for (const rid of b.role_ids) {
        await sequelize.query(
          `INSERT INTO user_role (user_id, role_id) VALUES (:uid, :rid)`,
          { replacements: { uid: id, rid } }
        );
      }
    }

    const updatedUser = await User.findByPk(id, {
      attributes: { exclude: ['password'] }
    });

    res.json(success(updatedUser, '更新用户信息成功'));
  } catch (err) {
    next(err);
  }
};

export const updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;

    if (!b.role) {
      return res.status(400).json(error('角色不能为空', 400));
    }

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    user.role = b.role;
    await user.save();

    // 同步更新user_role表
    const [roleRows]: any = await sequelize.query(
      `SELECT id FROM role WHERE role_code = :code`,
      { replacements: { code: b.role } }
    );
    if (roleRows.length > 0) {
      await sequelize.query(`DELETE FROM user_role WHERE user_id = :uid`, { replacements: { uid: id } });
      await sequelize.query(
        `INSERT INTO user_role (user_id, role_id) VALUES (:uid, :rid)`,
        { replacements: { uid: id, rid: roleRows[0].id } }
      );
    }

    const updatedUser = await User.findByPk(id, {
      attributes: { exclude: ['password'] }
    });

    res.json(success(updatedUser, '更新用户角色成功'));
  } catch (err) {
    next(err);
  }
};

// 批量分配角色给用户（新的RBAC方式）
export const assignUserRoles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const { role_ids } = req.body;

    if (!Array.isArray(role_ids)) {
      return res.status(400).json(error('role_ids 必须是数组', 400));
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    // 删除旧的角色关联
    await sequelize.query(`DELETE FROM user_role WHERE user_id = :uid`, { replacements: { uid: id } });

    // 插入新的角色关联
    for (const rid of role_ids) {
      await sequelize.query(
        `INSERT INTO user_role (user_id, role_id) VALUES (:uid, :rid)`,
        { replacements: { uid: id, rid } }
      );
    }

    // 同步更新用户表的role字段为第一个角色的code
    if (role_ids.length > 0) {
      const [firstRole]: any = await sequelize.query(
        `SELECT role_code FROM role WHERE id = :rid`,
        { replacements: { rid: role_ids[0] } }
      );
      if (firstRole.length > 0) {
        user.role = firstRole[0].role_code;
        await user.save();
      }
    }

    res.json(success(null, '角色分配成功'));
  } catch (err) {
    next(err);
  }
};

export const updateUserStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;

    if (!b.status) {
      return res.status(400).json(error('状态不能为空', 400));
    }

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    user.status = b.status;
    await user.save();

    const updatedUser = await User.findByPk(id, {
      attributes: { exclude: ['password'] }
    });

    res.json(success(updatedUser, '更新用户状态成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    // 只允许删除停用(inactive)状态的用户
    if (user.status !== 'inactive') {
      return res.status(400).json(error('只能删除停用状态的用户，激活或禁用状态的用户不允许删除', 400));
    }

    // 删除用户角色关联
    await sequelize.query(`DELETE FROM user_role WHERE user_id = :uid`, { replacements: { uid: id } });
    await user.destroy();

    res.json(success(null, '删除用户成功'));
  } catch (err) {
    next(err);
  }
};

export const getAssignableUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await User.findAll({
      where: {
        status: 'active'
      },
      attributes: ['id', 'username', 'real_name'],
      order: [['real_name', 'ASC']]
    });

    res.json(success(users, '获取可分配用户列表成功'));
  } catch (err) {
    next(err);
  }
};
