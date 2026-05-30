import sequelize from '../../config/database';

/**
 * 095: 备料任务明细 - 增加自动称量字段
 * ALTER TABLE backflush_task ADD auto_weigh NVARCHAR(1) DEFAULT N'N'
 */
export async function runMigration(): Promise<void> {
  const [colCheck]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'backflush_task' AND COLUMN_NAME = 'auto_weigh'`
  );
  if (colCheck[0].cnt === 0) {
    await sequelize.query(`ALTER TABLE backflush_task ADD auto_weigh NVARCHAR(1) DEFAULT N'N'`);
    console.log('  ✓ backflush_task.auto_weigh 字段已添加');
  } else {
    console.log('  → backflush_task.auto_weigh 字段已存在，跳过');
  }
  console.log('095: 备料任务明细-自动称量字段迁移完成');
}

runMigration().then(() => process.exit(0)).catch(err => { console.error('095 迁移失败:', err); process.exit(1); });
