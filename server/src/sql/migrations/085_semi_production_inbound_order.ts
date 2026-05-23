/**
 * 085: 半成品生产入库单表
 * - semi_production_inbound_order: 入库单主表
 * - semi_production_inbound_order_detail: 入库单明细表
 */
import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='semi_production_inbound_order' AND xtype='U')
      CREATE TABLE semi_production_inbound_order (
        id INT IDENTITY(1,1) PRIMARY KEY,
        inbound_order_number NVARCHAR(50) NOT NULL,
        warehouse_number NVARCHAR(50),
        warehouse_name NVARCHAR(100),
        total_quantity DECIMAL(18,4) DEFAULT 0,
        total_items INT DEFAULT 0,
        remark NVARCHAR(500),
        accounting_period NVARCHAR(10),
        operator NVARCHAR(50),
        inbound_date DATETIME DEFAULT GETDATE(),
        status NVARCHAR(20) DEFAULT N'正常',
        withdraw_operator NVARCHAR(100) DEFAULT '',
        withdraw_date DATETIME NULL,
        creation_date DATETIME DEFAULT GETDATE()
      )
    `)
    console.log('semi_production_inbound_order 表创建成功')
  } catch (e: any) {
    console.log('semi_production_inbound_order 表迁移跳过或已存在:', e?.message || e)
  }

  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_spio_number')
      CREATE UNIQUE INDEX IX_spio_number ON semi_production_inbound_order(inbound_order_number)
    `)
    console.log('IX_spio_number 索引创建成功')
  } catch (e: any) {
    console.log('IX_spio_number 索引跳过或已存在:', e?.message || e)
  }

  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='semi_production_inbound_order_detail' AND xtype='U')
      CREATE TABLE semi_production_inbound_order_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        inbound_order_number NVARCHAR(50) NOT NULL,
        line_number INT DEFAULT 1,
        production_order_number NVARCHAR(50),
        item_number NVARCHAR(50),
        item_name NVARCHAR(200),
        item_type NVARCHAR(50) DEFAULT N'半成品',
        specifications NVARCHAR(200),
        basic_unit NVARCHAR(20),
        batch_number NVARCHAR(50),
        planned_quantity DECIMAL(18,4) DEFAULT 0,
        inbound_quantity DECIMAL(18,4) DEFAULT 0,
        transaction_number NVARCHAR(50),
        remark NVARCHAR(500),
        creation_date DATETIME DEFAULT GETDATE()
      )
    `)
    console.log('semi_production_inbound_order_detail 表创建成功')
  } catch (e: any) {
    console.log('semi_production_inbound_order_detail 表迁移跳过或已存在:', e?.message || e)
  }

  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_spiod_order')
      CREATE INDEX IX_spiod_order ON semi_production_inbound_order_detail(inbound_order_number)
    `)
    console.log('IX_spiod_order 索引创建成功')
  } catch (e: any) {
    console.log('IX_spiod_order 索引跳过或已存在:', e?.message || e)
  }
}

runMigration().then(() => process.exit(0)).catch(err => { console.error('085 迁移失败:', err); process.exit(1); });
