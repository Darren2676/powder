import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

export interface LoginLogEntry {
  user_id: number | null;
  username: string;
  ip_address: string;
  user_agent: string;
  status: 'success' | 'failed';
  fail_reason?: string;
}

export async function isLoginLogEnabled(): Promise<boolean> {
  const rows: any[] = await sequelize.query(
    `SELECT setting_value FROM security_settings WHERE setting_key = 'login_log_enabled'`,
    { type: QueryTypes.SELECT }
  );
  return rows.length > 0 && rows[0].setting_value === 'true';
}

export async function recordLoginLog(entry: LoginLogEntry): Promise<void> {
  const enabled = await isLoginLogEnabled();
  if (!enabled) return;

  await sequelize.query(
    `INSERT INTO login_logs (user_id, username, ip_address, user_agent, status, fail_reason)
     VALUES (:user_id, :username, :ip_address, :user_agent, :status, :fail_reason)`,
    {
      replacements: {
        user_id: entry.user_id,
        username: entry.username,
        ip_address: entry.ip_address || '',
        user_agent: (entry.user_agent || '').substring(0, 500),
        status: entry.status,
        fail_reason: entry.fail_reason || ''
      },
      type: QueryTypes.INSERT
    }
  );
}

export async function getLockoutSettings(): Promise<{ maxAttempts: number; lockDuration: number }> {
  const rows: any[] = await sequelize.query(
    `SELECT setting_key, setting_value FROM security_settings
     WHERE setting_key IN ('login_max_attempts', 'login_lock_duration')`,
    { type: QueryTypes.SELECT }
  );

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.setting_key] = row.setting_value;
  }

  return {
    maxAttempts: parseInt(map.login_max_attempts || '5', 10),
    lockDuration: parseInt(map.login_lock_duration || '30', 10)
  };
}
