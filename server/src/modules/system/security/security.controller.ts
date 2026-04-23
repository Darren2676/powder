import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { QueryTypes } from 'sequelize';
import { success, error } from '../../../utils/response.util';
import { getPasswordPolicy, clearPolicyCache, validatePassword } from '../../../utils/passwordPolicy.util';
import { hashPassword } from '../../../utils/password.util';
import { parseUserAgent } from '../../../utils/userAgentParser.util';

// 获取所有安全设置
export const getSecuritySettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, setting_key, setting_value, description, updated_at FROM security_settings ORDER BY id`,
      { type: QueryTypes.SELECT }
    );
    res.json(success(rows, '获取安全设置成功'));
  } catch (err) {
    next(err);
  }
};

// 批量更新安全设置
export const updateSecuritySettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.settings || !Array.isArray(b.settings)) {
      return res.status(400).json(error('设置数据格式错误', 400));
    }

    const transaction = await sequelize.transaction();
    try {
      for (const item of b.settings) {
        await sequelize.query(
          `UPDATE security_settings SET setting_value = :value, updated_at = GETDATE() WHERE setting_key = :key`,
          {
            replacements: { key: item.setting_key, value: String(item.setting_value) },
            type: QueryTypes.UPDATE,
            transaction
          }
        );
      }
      await transaction.commit();
      clearPolicyCache();
      res.json(success(null, '安全设置更新成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) {
    next(err);
  }
};

// 获取密码策略（公开接口）
export const getPasswordPolicyApi = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policy = await getPasswordPolicy();
    res.json(success(policy, '获取密码策略成功'));
  } catch (err) {
    next(err);
  }
};

// 获取登录日志
export const getLoginLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, username, status: logStatus, start_date, end_date } = req.query;

    const conditions: string[] = ['1=1'];
    const replacements: any = {};

    if (username) {
      conditions.push(`username LIKE :username`);
      replacements.username = `%${username}%`;
    }
    if (logStatus) {
      conditions.push(`status = :status`);
      replacements.status = logStatus;
    }
    if (start_date) {
      conditions.push(`login_time >= :start_date`);
      replacements.start_date = start_date;
    }
    if (end_date) {
      conditions.push(`login_time <= :end_date + ' 23:59:59'`);
      replacements.end_date = end_date;
    }

    const whereClause = conditions.join(' AND ');
    const offset = (Number(page) - 1) * Number(limit);

    const countResult: any[] = await sequelize.query(
      `SELECT COUNT(*) as total FROM login_logs WHERE ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );
    const total = countResult[0]?.total || 0;

    const rows = await sequelize.query(
      `SELECT t.id, t.user_id, t.username, t.login_time, t.ip_address, t.user_agent, t.status, t.fail_reason FROM (
        SELECT id, user_id, username, login_time, ip_address, user_agent, status, fail_reason,
               ROW_NUMBER() OVER (ORDER BY login_time DESC) AS _row_num
        FROM login_logs WHERE ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      {
        replacements: { ...replacements, offset, offsetEnd: offset + Number(limit) },
        type: QueryTypes.SELECT
      }
    );

    // 解析 user_agent，附加 device_type 和 device_id
    const enrichedRows = (rows as any[]).map((row: any) => {
      const parsed = parseUserAgent(row.user_agent || '');
      return {
        ...row,
        device_type: parsed.device_type,
        device_id: parsed.device_id
      };
    });

    res.json(success({
      items: enrichedRows,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    }, '获取登录日志成功'));
  } catch (err) {
    next(err);
  }
};

// 管理员重置用户密码
export const resetUserPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = Number(req.params.id);
    const b = req.body;

    if (!b.new_password) {
      return res.status(400).json(error('新密码不能为空', 400));
    }

    // 验证密码策略
    const policy = await getPasswordPolicy();
    const policyErrors = validatePassword(b.new_password, policy);
    if (policyErrors.length > 0) {
      return res.status(400).json(error(policyErrors.join('; '), 400));
    }

    const hashedPassword = await hashPassword(b.new_password);
    const [, affected] = await sequelize.query(
      `UPDATE users SET password = :password, failed_login_attempts = 0, locked_until = NULL WHERE id = :id`,
      { replacements: { password: hashedPassword, id: userId }, type: QueryTypes.UPDATE }
    );

    if (affected === 0) {
      return res.status(404).json(error('用户不存在', 404));
    }

    res.json(success(null, '密码重置成功'));
  } catch (err) {
    next(err);
  }
};

// 解锁用户账户
export const unlockUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = Number(req.params.id);
    await sequelize.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = :id`,
      { replacements: { id: userId }, type: QueryTypes.UPDATE }
    );
    res.json(success(null, '用户已解锁'));
  } catch (err) {
    next(err);
  }
};
