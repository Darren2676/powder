/**
 * Umzug 数据库迁移框架配置
 * 管理 SQL Server 迁移的执行、回滚和状态追踪
 */
import { Umzug, SequelizeStorage } from 'umzug';
import sequelize from '@/config/database';
import path from 'path';
import { createLogger } from '@/config/logger';

const log = createLogger('migration');

const umzug = new Umzug({
  migrations: {
    glob: 'src/sql/migrations/*.ts',
    resolve: ({ name, path: migrationPath }) => {
      // 动态导入迁移文件，每个文件导出 up/down 函数
      const migration = require(migrationPath!);
      return {
        name,
        up: async () => {
          if (migration.up) {
            await migration.up(sequelize.getQueryInterface(), sequelize);
          } else if (migration.runMigration) {
            // 兼容旧格式：只有 runMigration() 的迁移文件
            await migration.runMigration();
          }
        },
        down: async () => {
          if (migration.down) {
            await migration.down(sequelize.getQueryInterface(), sequelize);
          } else {
            log.info({ name }, '无 down 函数，跳过回滚');
          }
        },
      };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, modelName: 'umzug_migrations' }),
  logger: log,
});

export default umzug;

/**
 * 执行所有待运行的迁移
 */
export const runPendingMigrations = async () => {
  const pending = await umzug.pending();
  if (pending.length === 0) {
    log.info('无待执行的迁移');
    return;
  }
  log.info({ pending: pending.map(m => m.name) }, '待执行迁移');
  await umzug.up();
  log.info('全部执行完成');
};

/**
 * 回滚最近一次迁移
 */
export const rollbackLastMigration = async () => {
  const executed = await umzug.executed();
  if (executed.length === 0) {
    log.info('无已执行的迁移可回滚');
    return;
  }
  const last = executed[executed.length - 1];
  log.info({ name: last.name }, '回滚迁移');
  await umzug.down({ migrations: [last.name], rerun: 'ALLOW' });
};

/**
 * 查看迁移状态
 */
export const getMigrationStatus = async () => {
  const executed = await umzug.executed();
  const pending = await umzug.pending();
  return {
    executed: executed.map(m => m.name),
    pending: pending.map(m => m.name),
  };
};
