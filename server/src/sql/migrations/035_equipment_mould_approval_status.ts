import sequelize from '../../config/database';

async function up() {
  const tables = ['equipment', 'mould'];

  for (const tbl of tables) {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tbl}' AND COLUMN_NAME = 'approval_status')
      ALTER TABLE [${tbl}] ADD approval_status NVARCHAR(20) DEFAULT N'未审核'
    `);
    console.log(`✓ ${tbl} approval_status 列已添加`);
  }

  for (const tbl of tables) {
    await sequelize.query(`UPDATE [${tbl}] SET approval_status = N'未审核' WHERE approval_status IS NULL OR LTRIM(RTRIM(approval_status)) = ''`);
  }

  console.log('设备/模具表 approval_status 迁移完成');
}

up().catch(err => { console.error('迁移失败:', err); process.exit(1); }).then(() => process.exit(0));
