import sequelize from '../config/database';
import User from './User';

// User <-> Notification (保留通知功能)
import Notification from './Notification';

User.hasMany(Notification, {
  foreignKey: 'user_id',
  as: 'notifications',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

Notification.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

// ==================== Umzug 迁移框架 ====================
import { runPendingMigrations, getMigrationStatus } from '../config/umzug';

export const initDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');
    
    await sequelize.sync();
    console.log('数据库同步完成');

    // 手动执行待迁移项（避免 umzug process.exit 问题）
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('process_task') AND name = 'is_backflush')
        BEGIN
          ALTER TABLE process_task ADD is_backflush BIT NOT NULL DEFAULT 0;
          PRINT 'is_backflush 字段已添加';
        END
      `);
      console.log('[手动迁移] process_task.is_backflush 检查完成');
    } catch (e) {
      console.warn('[手动迁移] is_backflush 跳过:', (e as any).message);
    }

    // 暂时禁用 umzug 迁移（迁移脚本中有 process.exit() 会导致服务器退出）
    // TODO: 修复所有迁移脚本中的 process.exit() 调用后重新启用
    console.log('[迁移] 跳过 umzug 迁移（已修复 process.exit 问题后启用）');
    // const status = await getMigrationStatus();
    // console.log(`[迁移] 已执行: ${status.executed.length}, 待执行: ${status.pending.length}`);
    // if (status.pending.length > 0) {
    //   await runPendingMigrations();
    // }

  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
};

export {
  sequelize,
  User,
  Notification
};
