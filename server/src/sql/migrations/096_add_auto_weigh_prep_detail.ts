import sequelize from '../../config/database';

/**
 * 096: 备料单明细 - 增加自动称量字段
 * ALTER TABLE material_preparation_detail ADD auto_weigh NVARCHAR(1) DEFAULT N'N'
 */
export async function runMigration(): Promise<void> {
  const [colCheck]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'material_preparation_detail' AND COLUMN_NAME = 'auto_weigh'`
  );
  if (colCheck[0].cnt === 0) {
    await sequelize.query(`ALTER TABLE material_preparation_detail ADD auto_weigh NVARCHAR(1) DEFAULT N'N'`);
    console.log('  ✓ material_preparation_detail.auto_weigh 字段已添加');
  } else {
    console.log('  → material_preparation_detail.auto_weigh 字段已存在，跳过');
  }
  console.log('096: 备料单明细-自动称量字段迁移完成');
}

runMigration().then(() => process.exit(0)).catch(err => { console.error('096 迁移失败:', err); process.exit(1); });