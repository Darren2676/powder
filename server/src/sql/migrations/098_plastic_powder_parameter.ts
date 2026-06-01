import sequelize from '../../config/database';

export async function up(): Promise<void> {
  // 创建塑粉参数表
  const [tableCheck]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM sysobjects WHERE name='plastic_powder_parameter' AND xtype='U'`
  );
  if (tableCheck[0].cnt === 0) {
    await sequelize.query(`
      CREATE TABLE plastic_powder_parameter (
        id INT IDENTITY(1,1) PRIMARY KEY,
        param_name NVARCHAR(100) NOT NULL,
        param_code NVARCHAR(50) NOT NULL,
        unit NVARCHAR(50) DEFAULT '',
        remark NVARCHAR(500) DEFAULT '',
        approval_status NVARCHAR(20) DEFAULT N'草稿',
        creation_date NVARCHAR(20) DEFAULT '',
        creation_man NVARCHAR(50) DEFAULT ''
      )
    `);
    // 添加唯一约束
    await sequelize.query(`ALTER TABLE plastic_powder_parameter ADD CONSTRAINT UQ_ppp_param_code UNIQUE (param_code)`);
    await sequelize.query(`ALTER TABLE plastic_powder_parameter ADD CONSTRAINT UQ_ppp_param_name UNIQUE (param_name)`);
    console.log('  ✓ plastic_powder_parameter 表创建成功');
  } else {
    console.log('  → plastic_powder_parameter 表已存在，跳过');
  }

  console.log('098: 塑粉参数表迁移完成');
}

export async function down(): Promise<void> {
  await sequelize.query(`DROP TABLE IF EXISTS plastic_powder_parameter`);
  console.log('098: 塑粉参数表回滚完成');
}

// 兼容旧格式直接执行
export async function runMigration() { await up(); }
runMigration().then(() => process.exit(0)).catch(err => { console.error('098 迁移失败:', err); process.exit(1); });
