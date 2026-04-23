import sequelize from '../../config/database';
import { QueryTypes } from 'sequelize';

/**
 * Migration 039: 修改 users 表 email 字段允许 NULL
 * - 移除 NOT NULL 约束
 * - 移除 UNIQUE 约束（允许多个用户不填邮箱）
 */
export async function up(): Promise<void> {
  // 1. 查找 email 列上所有的 UNIQUE 约束，使用 ALTER TABLE DROP CONSTRAINT 移除
  const uqConstraints: any[] = await sequelize.query(
    `SELECT tc.CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
     INNER JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
       ON tc.CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
     WHERE tc.TABLE_NAME = 'users'
       AND ccu.COLUMN_NAME = 'email'
       AND tc.CONSTRAINT_TYPE = 'UNIQUE'`,
    { type: QueryTypes.SELECT }
  );

  for (const c of uqConstraints) {
    await sequelize.query(`ALTER TABLE [users] DROP CONSTRAINT [${c.CONSTRAINT_NAME}]`);
    console.log(`  Dropped unique constraint: ${c.CONSTRAINT_NAME}`);
  }

  // 2. 修改 email 列允许 NULL
  await sequelize.query(`ALTER TABLE [users] ALTER COLUMN [email] NVARCHAR(100) NULL`);
  console.log('  Modified email column to allow NULL');
}

export async function down(): Promise<void> {
  // 回滚：将 NULL 值设为空字符串，然后恢复 NOT NULL + UNIQUE
  await sequelize.query(`UPDATE [users] SET email = '' WHERE email IS NULL`);
  await sequelize.query(`ALTER TABLE [users] ALTER COLUMN [email] NVARCHAR(100) NOT NULL`);
  await sequelize.query(`ALTER TABLE [users] ADD CONSTRAINT UQ_users_email UNIQUE (email)`);
}
