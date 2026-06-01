import sequelize from '../../config/database';

export async function runMigration(): Promise<void> {
  // 创建工艺参数主表
  const [headerCheck]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM sysobjects WHERE name='process_parameter_header' AND xtype='U'`
  );
  if (headerCheck[0].cnt === 0) {
    await sequelize.query(`
      CREATE TABLE process_parameter_header (
        id INT IDENTITY(1,1) PRIMARY KEY,
        parameter_number NVARCHAR(50) NOT NULL,
        item_number NVARCHAR(100) NOT NULL,
        item_name NVARCHAR(200) DEFAULT '',
        process_route_number NVARCHAR(50) NULL,
        version INT DEFAULT 1,
        description NVARCHAR(500) DEFAULT '',
        approval_status NVARCHAR(20) DEFAULT N'草稿',
        [condition] NVARCHAR(20) DEFAULT N'启用',
        creation_date NVARCHAR(20) DEFAULT '',
        creation_man NVARCHAR(50) DEFAULT '',
        remark NVARCHAR(500) DEFAULT ''
      )
    `);
    console.log('  ✓ process_parameter_header 表创建成功');
  } else {
    console.log('  → process_parameter_header 表已存在，跳过');
  }

  // 创建工艺参数明细表
  const [detailCheck]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM sysobjects WHERE name='process_parameter_detail' AND xtype='U'`
  );
  if (detailCheck[0].cnt === 0) {
    await sequelize.query(`
      CREATE TABLE process_parameter_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        parameter_number NVARCHAR(50) NOT NULL,
        line_number INT NOT NULL,
        step_number NVARCHAR(50) NULL,
        step_name NVARCHAR(100) DEFAULT '',
        param_name NVARCHAR(100) NOT NULL,
        param_code NVARCHAR(50) DEFAULT '',
        param_value NVARCHAR(200) NOT NULL,
        unit NVARCHAR(20) DEFAULT '',
        param_type NVARCHAR(20) DEFAULT N'输入',
        min_value NVARCHAR(50) DEFAULT '',
        max_value NVARCHAR(50) DEFAULT '',
        is_required NVARCHAR(1) DEFAULT N'Y',
        remark NVARCHAR(500) DEFAULT ''
      )
    `);
    console.log('  ✓ process_parameter_detail 表创建成功');
  } else {
    console.log('  → process_parameter_detail 表已存在，跳过');
  }

  console.log('097: 工艺参数表迁移完成');
}

runMigration().then(() => process.exit(0)).catch(err => { console.error('097 迁移失败:', err); process.exit(1); });
