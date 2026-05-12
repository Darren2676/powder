import sequelize from '../../config/database';

/**
 * 073: 倒冲任务清单 - 数据库变更
 * 1. 新建 backflush_task 倒冲任务主表
 * 2. 新建 backflush_deduction_log 倒冲扣减日志表
 */
export async function runMigration(): Promise<void> {
  // ========== 1. 新建 backflush_task 表 ==========
  const [tableCheck1]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'backflush_task'`
  );
  if (tableCheck1[0].cnt === 0) {
    await sequelize.query(`
      CREATE TABLE backflush_task (
        id INT IDENTITY(1,1) PRIMARY KEY,
        backflush_task_number VARCHAR(50) NOT NULL,
        production_order_number VARCHAR(50) NOT NULL DEFAULT '',
        item_number VARCHAR(50) NOT NULL DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit VARCHAR(20) DEFAULT '',
        planned_quantity DECIMAL(18,4) DEFAULT 0,
        bom_number VARCHAR(50) DEFAULT '',
        bom_base_quantity DECIMAL(18,4) DEFAULT 1,
        step_number INT NULL,
        standard_process_name NVARCHAR(100) DEFAULT '',
        work_center_number VARCHAR(50) DEFAULT '',
        work_center_name NVARCHAR(100) DEFAULT '',
        material_number VARCHAR(50) NOT NULL DEFAULT '',
        material_name NVARCHAR(200) DEFAULT '',
        material_type NVARCHAR(50) DEFAULT '',
        material_unit VARCHAR(20) DEFAULT '',
        bom_actual_quantity DECIMAL(18,4) DEFAULT 0,
        required_quantity DECIMAL(18,4) DEFAULT 0,
        deducted_quantity DECIMAL(18,4) DEFAULT 0,
        deduction_status NVARCHAR(20) DEFAULT N'待扣减',
        warehouse_number VARCHAR(50) DEFAULT '',
        warehouse_name NVARCHAR(100) DEFAULT '',
        error_message NVARCHAR(500) DEFAULT '',
        remark NVARCHAR(500) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE(),
        creation_man NVARCHAR(100) DEFAULT '',
        last_updated DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('  ✓ backflush_task 表已创建');
  } else {
    console.log('  → backflush_task 表已存在，跳过');
  }

  // 索引
  const [idxCheck1]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM sys.indexes WHERE name = 'IX_backflush_task_order' AND object_id = OBJECT_ID('backflush_task')`
  );
  if (idxCheck1[0].cnt === 0) {
    await sequelize.query('CREATE INDEX IX_backflush_task_order ON backflush_task(production_order_number)');
    console.log('  ✓ IX_backflush_task_order 索引已创建');
  }

  const [idxCheck2]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM sys.indexes WHERE name = 'IX_backflush_task_number' AND object_id = OBJECT_ID('backflush_task')`
  );
  if (idxCheck2[0].cnt === 0) {
    await sequelize.query('CREATE UNIQUE INDEX IX_backflush_task_number ON backflush_task(backflush_task_number)');
    console.log('  ✓ IX_backflush_task_number 索引已创建');
  }

  // ========== 2. 新建 backflush_deduction_log 表 ==========
  const [tableCheck2]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'backflush_deduction_log'`
  );
  if (tableCheck2[0].cnt === 0) {
    await sequelize.query(`
      CREATE TABLE backflush_deduction_log (
        id INT IDENTITY(1,1) PRIMARY KEY,
        backflush_task_id INT NOT NULL,
        backflush_task_number VARCHAR(50) NOT NULL DEFAULT '',
        production_order_number VARCHAR(50) NOT NULL DEFAULT '',
        material_number VARCHAR(50) NOT NULL DEFAULT '',
        inbound_quantity DECIMAL(18,4) DEFAULT 0,
        deduction_quantity DECIMAL(18,4) DEFAULT 0,
        batch_deductions NVARCHAR(MAX) DEFAULT '',
        transaction_number VARCHAR(50) DEFAULT '',
        warehouse_number VARCHAR(50) DEFAULT '',
        status NVARCHAR(20) DEFAULT N'成功',
        error_message NVARCHAR(500) DEFAULT '',
        operator NVARCHAR(100) DEFAULT '',
        deduction_date DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('  ✓ backflush_deduction_log 表已创建');
  } else {
    console.log('  → backflush_deduction_log 表已存在，跳过');
  }

  const [idxCheck3]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM sys.indexes WHERE name = 'IX_bdl_task_id' AND object_id = OBJECT_ID('backflush_deduction_log')`
  );
  if (idxCheck3[0].cnt === 0) {
    await sequelize.query('CREATE INDEX IX_bdl_task_id ON backflush_deduction_log(backflush_task_id)');
    console.log('  ✓ IX_bdl_task_id 索引已创建');
  }

  console.log('073: 倒冲任务清单迁移完成');
}

runMigration().then(() => process.exit(0)).catch(err => { console.error('073 迁移失败:', err); process.exit(1); });
