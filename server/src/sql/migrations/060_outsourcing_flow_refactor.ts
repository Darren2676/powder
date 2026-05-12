/**
 * 委外流程重构迁移
 * - outsourcing_material_issue 增加字段: doc_type, work_center_number, work_center_name, step_number, production_order_number, process_task_number
 * - outsourcing_receipt 增加字段: doc_type, inspection_warehouse_number, inspection_warehouse_name, next_step_warehouse_number, next_step_warehouse_name, next_step_number, next_work_center_number, next_work_center_name
 * - 创建 outsourcing_return_stockin + outsourcing_return_stockin_detail 表
 */
import sequelize from '../../config/database'

export async function up(): Promise<void> {
  // 1. outsourcing_material_issue 增加字段
  const addIssueColumns = [
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_material_issue') AND name = 'doc_type') ALTER TABLE outsourcing_material_issue ADD doc_type NVARCHAR(20) DEFAULT 'issue'`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_material_issue') AND name = 'work_center_number') ALTER TABLE outsourcing_material_issue ADD work_center_number NVARCHAR(50)`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_material_issue') AND name = 'work_center_name') ALTER TABLE outsourcing_material_issue ADD work_center_name NVARCHAR(100)`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_material_issue') AND name = 'step_number') ALTER TABLE outsourcing_material_issue ADD step_number INT`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_material_issue') AND name = 'production_order_number') ALTER TABLE outsourcing_material_issue ADD production_order_number NVARCHAR(50)`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_material_issue') AND name = 'process_task_number') ALTER TABLE outsourcing_material_issue ADD process_task_number NVARCHAR(50)`,
  ];
  for (const sql of addIssueColumns) {
    await sequelize.query(sql);
  }
  console.log('outsourcing_material_issue 字段扩展完成');

  // 2. outsourcing_receipt 增加字段
  const addReceiptColumns = [
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_receipt') AND name = 'doc_type') ALTER TABLE outsourcing_receipt ADD doc_type NVARCHAR(20) DEFAULT 'receipt'`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_receipt') AND name = 'inspection_warehouse_number') ALTER TABLE outsourcing_receipt ADD inspection_warehouse_number NVARCHAR(50)`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_receipt') AND name = 'inspection_warehouse_name') ALTER TABLE outsourcing_receipt ADD inspection_warehouse_name NVARCHAR(100)`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_receipt') AND name = 'next_step_warehouse_number') ALTER TABLE outsourcing_receipt ADD next_step_warehouse_number NVARCHAR(50)`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_receipt') AND name = 'next_step_warehouse_name') ALTER TABLE outsourcing_receipt ADD next_step_warehouse_name NVARCHAR(100)`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_receipt') AND name = 'next_step_number') ALTER TABLE outsourcing_receipt ADD next_step_number INT`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_receipt') AND name = 'next_work_center_number') ALTER TABLE outsourcing_receipt ADD next_work_center_number NVARCHAR(50)`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_receipt') AND name = 'next_work_center_name') ALTER TABLE outsourcing_receipt ADD next_work_center_name NVARCHAR(100)`,
  ];
  for (const sql of addReceiptColumns) {
    await sequelize.query(sql);
  }
  console.log('outsourcing_receipt 字段扩展完成');

  // 3. 创建 outsourcing_return_stockin 表
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'outsourcing_return_stockin')
    CREATE TABLE outsourcing_return_stockin (
      id INT IDENTITY(1,1) PRIMARY KEY,
      stockin_number NVARCHAR(50) NOT NULL,
      outsourcing_order_number NVARCHAR(50) NOT NULL,
      receipt_number NVARCHAR(50),
      inspection_number NVARCHAR(50),
      warehouse_from NVARCHAR(50),
      warehouse_to NVARCHAR(50),
      step_number INT,
      work_center_number NVARCHAR(50),
      production_order_number NVARCHAR(50),
      stockin_date DATE,
      status NVARCHAR(20) DEFAULT N'草稿',
      remark NVARCHAR(200),
      creation_date DATETIME DEFAULT GETDATE(),
      creation_man NVARCHAR(50)
    )
  `);
  console.log('outsourcing_return_stockin 表创建完成');

  // 4. 创建 outsourcing_return_stockin_detail 表
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'outsourcing_return_stockin_detail')
    CREATE TABLE outsourcing_return_stockin_detail (
      id INT IDENTITY(1,1) PRIMARY KEY,
      stockin_number NVARCHAR(50) NOT NULL,
      line_number INT,
      item_number NVARCHAR(50),
      item_name NVARCHAR(100),
      specifications NVARCHAR(200),
      basic_unit NVARCHAR(20),
      qualified_quantity DECIMAL(18,4) DEFAULT 0,
      batch_number NVARCHAR(50)
    )
  `);
  console.log('outsourcing_return_stockin_detail 表创建完成');

  console.log('委外流程重构迁移完成');
}

export async function down(): Promise<void> {
  await sequelize.query(`IF OBJECT_ID('outsourcing_return_stockin_detail') IS NOT NULL DROP TABLE outsourcing_return_stockin_detail`);
  await sequelize.query(`IF OBJECT_ID('outsourcing_return_stockin') IS NOT NULL DROP TABLE outsourcing_return_stockin`);

  const dropIssueColumns = ['process_task_number', 'production_order_number', 'step_number', 'work_center_name', 'work_center_number', 'doc_type'];
  for (const col of dropIssueColumns) {
    await sequelize.query(`IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_material_issue') AND name = '${col}') ALTER TABLE outsourcing_material_issue DROP COLUMN ${col}`);
  }

  const dropReceiptColumns = ['next_work_center_name', 'next_work_center_number', 'next_step_number', 'next_step_warehouse_name', 'next_step_warehouse_number', 'inspection_warehouse_name', 'inspection_warehouse_number', 'doc_type'];
  for (const col of dropReceiptColumns) {
    await sequelize.query(`IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_receipt') AND name = '${col}') ALTER TABLE outsourcing_receipt DROP COLUMN ${col}`);
  }
  console.log('委外流程重构迁移回滚完成');
}
