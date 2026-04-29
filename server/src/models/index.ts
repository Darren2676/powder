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

    // 使用 umzug 框架执行迁移（自动追踪已执行状态，跳过已完成迁移）
    const status = await getMigrationStatus();
    console.log(`[迁移] 已执行: ${status.executed.length}, 待执行: ${status.pending.length}`);
    if (status.pending.length > 0) {
      await runPendingMigrations();
    }

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
