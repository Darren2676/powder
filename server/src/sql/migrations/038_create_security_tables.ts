/**
 * 安全模块迁移脚本
 * 创建 login_logs（登录日志）和 security_settings（安全设置）表
 * 
 * Run: npx ts-node src/sql/migrations/038_create_security_tables.ts
 */

import sequelize from '../../config/database'

async function createSecurityTables() {
  console.log('Starting security tables migration...')

  try {
    await sequelize.authenticate()
    console.log('Database connection established.')

    // 1. 创建 security_settings 表
    console.log('Creating security_settings table...')
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'security_settings')
      BEGIN
        CREATE TABLE security_settings (
          id INT IDENTITY(1,1) PRIMARY KEY,
          setting_key NVARCHAR(100) NOT NULL UNIQUE,
          setting_value NVARCHAR(500) NOT NULL DEFAULT '',
          description NVARCHAR(500) DEFAULT '',
          updated_at DATETIME DEFAULT GETDATE()
        )
      END
    `)
    console.log('security_settings table created.')

    // 2. 插入默认安全设置（如果不存在）
    console.log('Inserting default security settings...')
    const defaults = [
      { key: 'login_log_enabled', value: 'true', desc: '启用登录日志记录' },
      { key: 'login_max_attempts', value: '5', desc: '最大登录失败次数（超过后锁定账户）' },
      { key: 'login_lock_duration', value: '30', desc: '账户锁定时长（分钟）' },
      { key: 'password_min_length', value: '6', desc: '密码最小长度' },
      { key: 'password_require_uppercase', value: 'false', desc: '密码是否必须包含大写字母' },
      { key: 'password_require_lowercase', value: 'false', desc: '密码是否必须包含小写字母' },
      { key: 'password_require_number', value: 'false', desc: '密码是否必须包含数字' },
      { key: 'password_require_special', value: 'false', desc: '密码是否必须包含特殊字符' },
    ]

    for (const item of defaults) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM security_settings WHERE setting_key = :key)
        BEGIN
          INSERT INTO security_settings (setting_key, setting_value, description, updated_at)
          VALUES (:key, :value, :desc, GETDATE())
        END
      `, {
        replacements: { key: item.key, value: item.value, desc: item.desc }
      })
    }
    console.log('Default security settings inserted.')

    // 3. 创建 login_logs 表
    console.log('Creating login_logs table...')
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'login_logs')
      BEGIN
        CREATE TABLE login_logs (
          id INT IDENTITY(1,1) PRIMARY KEY,
          user_id INT NULL,
          username NVARCHAR(100) NOT NULL,
          login_time DATETIME DEFAULT GETDATE(),
          ip_address NVARCHAR(50) DEFAULT '',
          user_agent NVARCHAR(500) DEFAULT '',
          status NVARCHAR(20) NOT NULL,
          fail_reason NVARCHAR(500) DEFAULT ''
        )
      END
    `)
    console.log('login_logs table created.')

    // 4. 创建索引
    console.log('Creating indexes...')
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes 
                     WHERE name = 'IX_login_logs_username' AND object_id = OBJECT_ID('login_logs'))
      BEGIN
        CREATE INDEX IX_login_logs_username ON login_logs(username)
      END
    `)
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes 
                     WHERE name = 'IX_login_logs_login_time' AND object_id = OBJECT_ID('login_logs'))
      BEGIN
        CREATE INDEX IX_login_logs_login_time ON login_logs(login_time DESC)
      END
    `)
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes 
                     WHERE name = 'IX_login_logs_status' AND object_id = OBJECT_ID('login_logs'))
      BEGIN
        CREATE INDEX IX_login_logs_status ON login_logs(status)
      END
    `)
    console.log('Indexes created.')

    console.log('Security tables migration completed successfully!')

  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  } finally {
    await sequelize.close()
  }
}

// Run if called directly
createSecurityTables()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))

export { createSecurityTables }
