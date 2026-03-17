import sequelize from './src/config/database';

async function migrate() {
  try {
    // 1. Create approval_log table
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='approval_log' AND xtype='U')
      CREATE TABLE approval_log (
        id INT IDENTITY(1,1) PRIMARY KEY,
        module NVARCHAR(50) NOT NULL,
        record_id NVARCHAR(100) NOT NULL,
        action NVARCHAR(30) NOT NULL,
        from_status NVARCHAR(30) NOT NULL,
        to_status NVARCHAR(30) NOT NULL,
        operator_id INT NOT NULL,
        operator_name NVARCHAR(100) NOT NULL,
        remark NVARCHAR(500) NULL,
        created_at DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('approval_log table created');

    // Create index
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_approval_log_module_record')
      CREATE INDEX IX_approval_log_module_record ON approval_log(module, record_id)
    `);
    console.log('Index created');

    // 2. Add approval_status to routing_header
    const [rhCols]: any = await sequelize.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='routing_header' AND COLUMN_NAME='approval_status'`);
    if (rhCols.length === 0) {
      await sequelize.query(`ALTER TABLE routing_header ADD approval_status NVARCHAR(30) NOT NULL DEFAULT N'草稿'`);
      console.log('routing_header: approval_status added');
    } else {
      console.log('routing_header: approval_status already exists');
    }

    // 3. Add approval_status to production_task
    const [ptCols]: any = await sequelize.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='production_task' AND COLUMN_NAME='approval_status'`);
    if (ptCols.length === 0) {
      await sequelize.query(`ALTER TABLE production_task ADD approval_status NVARCHAR(30) NOT NULL DEFAULT N'草稿'`);
      console.log('production_task: approval_status added');
    } else {
      console.log('production_task: approval_status already exists');
    }

    // 4. Add approval_status to Production_plan
    const [ppCols]: any = await sequelize.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Production_plan' AND COLUMN_NAME='approval_status'`);
    if (ppCols.length === 0) {
      await sequelize.query(`ALTER TABLE Production_plan ADD approval_status NVARCHAR(30) NOT NULL DEFAULT N'草稿'`);
      console.log('Production_plan: approval_status added');
    } else {
      console.log('Production_plan: approval_status already exists');
    }

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
