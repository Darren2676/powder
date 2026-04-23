import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

export interface PasswordPolicy {
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_lowercase: boolean;
  password_require_number: boolean;
  password_require_special: boolean;
}

let cachedPolicy: PasswordPolicy | null = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  const now = Date.now();
  if (cachedPolicy && (now - cacheTime) < CACHE_TTL) {
    return cachedPolicy;
  }

  const rows: any[] = await sequelize.query(
    `SELECT setting_key, setting_value FROM security_settings
     WHERE setting_key IN (
       'password_min_length', 'password_require_uppercase',
       'password_require_lowercase', 'password_require_number',
       'password_require_special'
     )`,
    { type: QueryTypes.SELECT }
  );

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.setting_key] = row.setting_value;
  }

  cachedPolicy = {
    password_min_length: parseInt(map.password_min_length || '6', 10),
    password_require_uppercase: map.password_require_uppercase === 'true',
    password_require_lowercase: map.password_require_lowercase === 'true',
    password_require_number: map.password_require_number === 'true',
    password_require_special: map.password_require_special === 'true',
  };
  cacheTime = now;
  return cachedPolicy;
}

export function clearPolicyCache() {
  cachedPolicy = null;
  cacheTime = 0;
}

export function validatePassword(password: string, policy: PasswordPolicy): string[] {
  const errors: string[] = [];

  if (password.length < policy.password_min_length) {
    errors.push(`密码长度不能少于${policy.password_min_length}个字符`);
  }
  if (policy.password_require_uppercase && !/[A-Z]/.test(password)) {
    errors.push('密码必须包含大写字母');
  }
  if (policy.password_require_lowercase && !/[a-z]/.test(password)) {
    errors.push('密码必须包含小写字母');
  }
  if (policy.password_require_number && !/\d/.test(password)) {
    errors.push('密码必须包含数字');
  }
  if (policy.password_require_special && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('密码必须包含特殊字符');
  }

  return errors;
}
