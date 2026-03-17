import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { User } from '../models';
import { success, error, paginate } from '../utils/response.util';
import { hashPassword } from '../utils/password.util';

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

    res.json(paginate(rows, count, Number(page), Number(limit)));
  } catch (err) {
    next(err);
  }
};

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password, email, real_name, role, department, phone, status } = req.body;

    if (!username || !password) {
      return res.status(400).json(error('用户名和密码不能为空', 400));
    }

    // 检查用户名是否已存在
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json(error('用户名已存在', 400));
    }

    // 检查邮箱是否已存在
    if (email) {
      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        return res.status(400).json(error('邮箱已被使用', 400));
      }
    }

    // 创建用户
    const hashedPassword = await hashPassword(password);
    const user = await User.create({
      username,
      password: hashedPassword,
      email: email || null,
      real_name: real_name || '',
      role: role || 'staff',
      department: department || '',
      phone: phone || '',
      status: status || 'active'
    });

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

    res.json(success(user, '获取用户信息成功'));
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const { username, email, real_name, department, phone, avatar } = req.body;

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    if (username && username !== user.username) {
      const existingUser = await User.findOne({ where: { username } });
      if (existingUser) {
        return res.status(400).json(error('用户名已存在', 400));
      }
      user.username = username;
    }

    if (email && email !== user.email) {
      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        return res.status(400).json(error('邮箱已被使用', 400));
      }
      user.email = email;
    }

    if (real_name !== undefined) user.real_name = real_name;
    if (department !== undefined) user.department = department;
    if (phone !== undefined) user.phone = phone;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

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
    const { role } = req.body;

    if (!role) {
      return res.status(400).json(error('角色不能为空', 400));
    }

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    user.role = role;
    await user.save();

    const updatedUser = await User.findByPk(id, {
      attributes: { exclude: ['password'] }
    });

    res.json(success(updatedUser, '更新用户角色成功'));
  } catch (err) {
    next(err);
  }
};

export const updateUserStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;

    if (!status) {
      return res.status(400).json(error('状态不能为空', 400));
    }

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    user.status = status;
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
