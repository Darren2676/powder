import { Request, Response, NextFunction } from 'express';
import { User } from '../models';
import { hashPassword, comparePassword } from '../utils/password.util';
import { generateToken } from '../utils/jwt.util';
import { success, error } from '../utils/response.util';

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, email, password, real_name, department, phone } = req.body;

    if (!username || !email || !password || !real_name) {
      return res.status(400).json(error('用户名、邮箱、密码和真实姓名不能为空', 400));
    }

    const existingUser = await User.findOne({
      where: {
        username
      }
    });

    if (existingUser) {
      return res.status(400).json(error('用户名已存在', 400));
    }

    const existingEmail = await User.findOne({
      where: {
        email
      }
    });

    if (existingEmail) {
      return res.status(400).json(error('邮箱已被使用', 400));
    }

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      real_name,
      department,
      phone,
      role: 'staff',
      status: 'active'
    });

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    res.status(201).json(success({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        real_name: user.real_name,
        role: user.role,
        department: user.department,
        phone: user.phone,
        avatar: user.avatar,
        status: user.status
      }
    }, '注册成功'));
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json(error('用户名和密码不能为空', 400));
    }

    const user = await User.findOne({
      where: {
        username
      }
    });

    if (!user) {
      return res.status(401).json(error('用户名或密码错误', 401));
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json(error('用户名或密码错误', 401));
    }

    if (user.status !== 'active') {
      return res.status(401).json(error('账号已被禁用', 401));
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    res.json(success({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        real_name: user.real_name,
        role: user.role,
        department: user.department,
        phone: user.phone,
        avatar: user.avatar,
        status: user.status
      }
    }, '登录成功'));
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findByPk(req.user!.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    res.json(success(user, '获取当前用户信息成功'));
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { real_name, department, phone, avatar } = req.body;

    const user = await User.findByPk(req.user!.id);

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    if (real_name !== undefined) user.real_name = real_name;
    if (department !== undefined) user.department = department;
    if (phone !== undefined) user.phone = phone;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    const updatedUser = await User.findByPk(req.user!.id, {
      attributes: { exclude: ['password'] }
    });

    res.json(success(updatedUser, '更新个人信息成功'));
  } catch (err) {
    next(err);
  }
};

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json(error('旧密码和新密码不能为空', 400));
    }

    const user = await User.findByPk(req.user!.id);

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    const isPasswordValid = await comparePassword(oldPassword, user.password);

    if (!isPasswordValid) {
      return res.status(401).json(error('旧密码错误', 401));
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    res.json(success(null, '修改密码成功'));
  } catch (err) {
    next(err);
  }
};
