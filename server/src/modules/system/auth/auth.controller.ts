import { Request, Response, NextFunction } from 'express';
import { User } from '../../../models';
import { hashPassword, comparePassword } from '../../../utils/password.util';
import { generateToken, verifyRefreshableToken } from '../../../utils/jwt.util';
import { success, error } from '../../../utils/response.util';
import { getPasswordPolicy, validatePassword as validatePwd } from '../../../utils/passwordPolicy.util';
import { recordLoginLog, getLockoutSettings } from '../../../utils/loginLog.util';
import sequelize from '../../../config/database';

// 获取用户权限信息的辅助函数
async function getUserPermissions(userId: number) {
  const permissions: any = await sequelize.query(
    `SELECT DISTINCT p.id, p.permission_name, p.permission_code, p.permission_type,
      p.parent_id, p.menu_key, p.route_path, p.icon, p.sort_order
    FROM permission p
    INNER JOIN role_permission rp ON rp.permission_id = p.id
    INNER JOIN user_role ur ON ur.role_id = rp.role_id
    WHERE ur.user_id = :uid AND p.status = N'启用'
    ORDER BY p.sort_order, p.id`,
    { replacements: { uid: userId }, type: 'SELECT' }
  );

  // 获取用户角色
  const roles: any = await sequelize.query(
    `SELECT r.id, r.role_name, r.role_code
     FROM user_role ur
     INNER JOIN role r ON r.id = ur.role_id
     WHERE ur.user_id = :uid AND r.status = N'启用'`,
    { replacements: { uid: userId }, type: 'SELECT' }
  );

  const menuKeys: string[] = [];
  const permissionCodes: string[] = [];

  for (const p of permissions) {
    permissionCodes.push(p.permission_code);
    if (p.menu_key) menuKeys.push(p.menu_key);
  }

  const roleCodes = roles.map((r: any) => r.role_code);
  const isAdmin = roleCodes.includes('admin');

  return { permissions, roles, menuKeys, permissionCodes, roleCodes, isAdmin };
}

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;

    if (!b.username || !b.phone || !b.password || !b.real_name) {
      return res.status(400).json(error('用户名、手机号、密码和真实姓名不能为空', 400));
    }

    // 验证密码策略
    const policy = await getPasswordPolicy();
    const policyErrors = validatePwd(b.password, policy);
    if (policyErrors.length > 0) {
      return res.status(400).json(error(policyErrors.join('; '), 400));
    }

    const existingUser = await User.findOne({
      where: {
        username: b.username
      }
    });

    if (existingUser) {
      return res.status(400).json(error('用户名已存在', 400));
    }

    if (b.phone) {
      const existingPhone = await User.findOne({
        where: {
          phone: b.phone
        }
      });

      if (existingPhone) {
        return res.status(400).json(error('手机号已被使用', 400));
      }
    }

    const hashedPassword = await hashPassword(b.password);

    const user = await User.create({
      username: b.username,
      email: b.email || null,
      password: hashedPassword,
      real_name: b.real_name,
      department: b.department,
      phone: b.phone,
      role: 'staff',
      status: 'active'
    });

    // 自动分配staff角色
    const [staffRole]: any = await sequelize.query(
      `SELECT id FROM role WHERE role_code = 'staff'`,
      { type: 'SELECT' }
    );
    if (staffRole.length > 0) {
      await sequelize.query(
        `INSERT INTO user_role (user_id, role_id) VALUES (:uid, :rid)`,
        { replacements: { uid: user.id, rid: staffRole[0].id } }
      );
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    // 获取权限信息
    const permInfo = await getUserPermissions(user.id);

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
      },
      permissions: permInfo
    }, '注册成功'));
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    if (!b.username || !b.password) {
      return res.status(400).json(error('用户名和密码不能为空', 400));
    }

    const user = await User.findOne({
      where: {
        username: b.username
      }
    });

    if (!user) {
      // 记录失败日志
      await recordLoginLog({
        user_id: null,
        username: b.username,
        ip_address: ipAddress,
        user_agent: userAgent,
        status: 'failed',
        fail_reason: '用户不存在'
      });
      return res.status(401).json(error('用户名或密码错误', 401));
    }

    // 检查账户是否被锁定
    if (user.locked_until) {
      const lockTime = new Date(user.locked_until);
      if (lockTime > new Date()) {
        const remainMinutes = Math.ceil((lockTime.getTime() - Date.now()) / 60000);
        await recordLoginLog({
          user_id: user.id,
          username: b.username,
          ip_address: ipAddress,
          user_agent: userAgent,
          status: 'failed',
          fail_reason: '账户已锁定'
        });
        return res.status(401).json(error(`账户已锁定，请${remainMinutes}分钟后再试`, 401));
      }
    }

    const isPasswordValid = await comparePassword(b.password, user.password);

    if (!isPasswordValid) {
      // 登录失败，增加失败次数
      const lockoutSettings = await getLockoutSettings();
      const attempts = (user.failed_login_attempts || 0) + 1;

      if (attempts >= lockoutSettings.maxAttempts) {
        // 锁定账户
        const lockUntil = new Date(Date.now() + lockoutSettings.lockDuration * 60000);
        await User.update(
          { failed_login_attempts: attempts, locked_until: lockUntil } as any,
          { where: { id: user.id } }
        );
        await recordLoginLog({
          user_id: user.id,
          username: b.username,
          ip_address: ipAddress,
          user_agent: userAgent,
          status: 'failed',
          fail_reason: `密码错误，已锁定${lockoutSettings.lockDuration}分钟`
        });
        return res.status(401).json(error(`登录失败次数过多，账户已锁定${lockoutSettings.lockDuration}分钟`, 401));
      } else {
        await User.update(
          { failed_login_attempts: attempts } as any,
          { where: { id: user.id } }
        );
        await recordLoginLog({
          user_id: user.id,
          username: b.username,
          ip_address: ipAddress,
          user_agent: userAgent,
          status: 'failed',
          fail_reason: `密码错误(${attempts}/${lockoutSettings.maxAttempts})`
        });
        return res.status(401).json(error(`用户名或密码错误，还剩${lockoutSettings.maxAttempts - attempts}次尝试机会`, 401));
      }
    }

    if (user.status !== 'active') {
      await recordLoginLog({
        user_id: user.id,
        username: b.username,
        ip_address: ipAddress,
        user_agent: userAgent,
        status: 'failed',
        fail_reason: '账号已被禁用'
      });
      return res.status(401).json(error('账号已被禁用', 401));
    }

    // 登录成功，重置失败次数
    await User.update(
      { failed_login_attempts: 0, locked_until: null } as any,
      { where: { id: user.id } }
    );

    // 记录成功日志
    await recordLoginLog({
      user_id: user.id,
      username: b.username,
      ip_address: ipAddress,
      user_agent: userAgent,
      status: 'success'
    });

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    // 获取权限信息
    const permInfo = await getUserPermissions(user.id);

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
      },
      permissions: permInfo
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

    // 获取权限信息
    const permInfo = await getUserPermissions(user.id);

    res.json(success({ ...user.toJSON(), permissions: permInfo }, '获取当前用户信息成功'));
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;

    const user = await User.findByPk(req.user!.id);

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    if (b.real_name !== undefined) user.real_name = b.real_name;
    if (b.department !== undefined) user.department = b.department;
    if (b.phone !== undefined) user.phone = b.phone;
    if (b.avatar !== undefined) user.avatar = b.avatar;

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
    const b = req.body;

    if (!b.oldPassword || !b.newPassword) {
      return res.status(400).json(error('旧密码和新密码不能为空', 400));
    }

    // 验证新密码策略
    const policy = await getPasswordPolicy();
    const policyErrors = validatePwd(b.newPassword, policy);
    if (policyErrors.length > 0) {
      return res.status(400).json(error(policyErrors.join('; '), 400));
    }

    const user = await User.findByPk(req.user!.id);

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    const isPasswordValid = await comparePassword(b.oldPassword, user.password);

    if (!isPasswordValid) {
      return res.status(401).json(error('旧密码错误', 401));
    }

    user.password = await hashPassword(b.newPassword);
    await user.save();

    res.json(success(null, '修改密码成功'));
  } catch (err) {
    next(err);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(success(null, '退出登录成功'));
  } catch (err) {
    next(err);
  }
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(error('未提供认证令牌', 401));
    }

    const token = authHeader.substring(7);

    // 验证token是否可刷新（过期但在刷新窗口内）
    let decoded: any;
    try {
      decoded = verifyRefreshableToken(token);
    } catch (err: any) {
      return res.status(401).json(error(err.message || '令牌刷新失败', 401));
    }

    // 检查用户是否仍然有效
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(401).json(error('用户不存在', 401));
    }

    if (user.status !== 'active') {
      return res.status(401).json(error('用户已被禁用', 401));
    }

    // 生成新token
    const newToken = generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    // 获取最新权限信息
    const permInfo = await getUserPermissions(user.id);

    res.json(success({
      token: newToken,
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
      },
      permissions: permInfo
    }, '令牌刷新成功'));
  } catch (err) {
    next(err);
  }
};
