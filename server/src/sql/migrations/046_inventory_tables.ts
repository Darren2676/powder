/**
 * 库存域表迁移
 * - finished_goods_inventory, inventory_transaction
 * - material_inventory, material_inventory_transaction
 * - 批次管理表 (material_batch_inventory, finished_batch_inventory, batch_traceability, batch_number_sequence)
 * - quality_status 列
 * - production_inbound_order + detail
 */

import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  // finished_goods_inventory 成品库存表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='finished_goods_inventory' AND xtype='U')
      CREATE TABLE finished_goods_inventory (
        id INT IDENTITY(1,1) PRIMARY KEY,
        item_number NVARCHAR(100) NOT NULL,
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        product_drawing_number NVARCHAR(100) DEFAULT '',
        warehouse_number NVARCHAR(50) NOT NULL,
        warehouse_name NVARCHAR(200) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        last_updated DATETIME DEFAULT GETDATE(),
        creation_date DATETIME DEFAULT GETDATE()
      )
    `)
  } catch (e) { console.log('finished_goods_inventory 表迁移跳过或已存在') }

  // inventory_transaction 库存流水记录表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='inventory_transaction' AND xtype='U')
      CREATE TABLE inventory_transaction (
        id INT IDENTITY(1,1) PRIMARY KEY,
        transaction_number NVARCHAR(50) NOT NULL,
        transaction_type NVARCHAR(20) DEFAULT '',
        source_type NVARCHAR(50) DEFAULT '',
        source_number NVARCHAR(50) DEFAULT '',
        item_number NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        product_drawing_number NVARCHAR(100) DEFAULT '',
        warehouse_number NVARCHAR(50) DEFAULT '',
        warehouse_name NVARCHAR(200) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        before_quantity DECIMAL(18,4) DEFAULT 0,
        after_quantity DECIMAL(18,4) DEFAULT 0,
        operator NVARCHAR(100) DEFAULT '',
        operation_date DATETIME DEFAULT GETDATE(),
        remark NVARCHAR(500) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE()
      )
    `)
  } catch (e) { console.log('inventory_transaction 表迁移跳过或已存在') }

  // material_inventory 物料库存表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='material_inventory' AND xtype='U')
      CREATE TABLE material_inventory (
        id INT IDENTITY(1,1) PRIMARY KEY,
        item_number NVARCHAR(100) NOT NULL,
        item_name NVARCHAR(200) DEFAULT '',
        item_type NVARCHAR(50) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        warehouse_number NVARCHAR(50) NOT NULL,
        warehouse_name NVARCHAR(200) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        safety_stock_quantity DECIMAL(18,4) DEFAULT 0,
        last_updated DATETIME DEFAULT GETDATE(),
        creation_date DATETIME DEFAULT GETDATE()
      )
    `)
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='material_inventory_transaction' AND xtype='U')
      CREATE TABLE material_inventory_transaction (
        id INT IDENTITY(1,1) PRIMARY KEY,
        transaction_number NVARCHAR(50) NOT NULL,
        transaction_type NVARCHAR(20) DEFAULT '',
        source_type NVARCHAR(50) DEFAULT '',
        source_number NVARCHAR(50) DEFAULT '',
        item_number NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        item_type NVARCHAR(50) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        warehouse_number NVARCHAR(50) DEFAULT '',
        warehouse_name NVARCHAR(200) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        before_quantity DECIMAL(18,4) DEFAULT 0,
        after_quantity DECIMAL(18,4) DEFAULT 0,
        batch_number NVARCHAR(100) DEFAULT '',
        supplier_number NVARCHAR(50) DEFAULT '',
        supplier_name NVARCHAR(200) DEFAULT '',
        operator NVARCHAR(100) DEFAULT '',
        operation_date DATETIME DEFAULT GETDATE(),
        remark NVARCHAR(500) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE()
      )
    `)
  } catch (e) { console.log('material_inventory 表迁移跳过或已存在') }

  // 批次管理相关表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='material_batch_inventory' AND xtype='U')
      CREATE TABLE material_batch_inventory (
        id INT IDENTITY(1,1) PRIMARY KEY,
        batch_number NVARCHAR(50) NOT NULL,
        item_number NVARCHAR(100) NOT NULL,
        item_name NVARCHAR(200) DEFAULT '',
        item_type NVARCHAR(50) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        warehouse_number NVARCHAR(50) NOT NULL,
        warehouse_name NVARCHAR(200) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        initial_quantity DECIMAL(18,4) DEFAULT 0,
        supplier_number NVARCHAR(50) DEFAULT '',
        supplier_name NVARCHAR(200) DEFAULT '',
        production_order_number NVARCHAR(50) DEFAULT '',
        inbound_date DATETIME DEFAULT GETDATE(),
        status NVARCHAR(20) DEFAULT N'正常',
        creation_date DATETIME DEFAULT GETDATE(),
        last_updated DATETIME DEFAULT GETDATE()
      );
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='finished_batch_inventory' AND xtype='U')
      CREATE TABLE finished_batch_inventory (
        id INT IDENTITY(1,1) PRIMARY KEY,
        batch_number NVARCHAR(50) NOT NULL,
        item_number NVARCHAR(100) NOT NULL,
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        product_drawing_number NVARCHAR(100) DEFAULT '',
        warehouse_number NVARCHAR(50) NOT NULL,
        warehouse_name NVARCHAR(200) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        initial_quantity DECIMAL(18,4) DEFAULT 0,
        production_order_number NVARCHAR(50) DEFAULT '',
        inbound_date DATETIME DEFAULT GETDATE(),
        status NVARCHAR(20) DEFAULT N'正常',
        creation_date DATETIME DEFAULT GETDATE(),
        last_updated DATETIME DEFAULT GETDATE()
      );
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='batch_traceability' AND xtype='U')
      CREATE TABLE batch_traceability (
        id INT IDENTITY(1,1) PRIMARY KEY,
        finished_batch_number NVARCHAR(50) NOT NULL,
        finished_item_number NVARCHAR(100) DEFAULT '',
        finished_item_name NVARCHAR(200) DEFAULT '',
        production_order_number NVARCHAR(50) DEFAULT '',
        material_batch_number NVARCHAR(50) NOT NULL,
        material_item_number NVARCHAR(100) DEFAULT '',
        material_item_name NVARCHAR(200) DEFAULT '',
        material_quantity DECIMAL(18,4) DEFAULT 0,
        issue_number NVARCHAR(50) DEFAULT '',
        link_type NVARCHAR(20) DEFAULT N'领料',
        creation_date DATETIME DEFAULT GETDATE()
      );
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='batch_number_sequence' AND xtype='U')
      CREATE TABLE batch_number_sequence (
        id INT IDENTITY(1,1) PRIMARY KEY,
        prefix NVARCHAR(30) NOT NULL,
        current_seq INT DEFAULT 0,
        last_updated DATETIME DEFAULT GETDATE()
      );
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'inventory_transaction' AND COLUMN_NAME = 'batch_number')
      BEGIN
        ALTER TABLE inventory_transaction ADD batch_number NVARCHAR(50) DEFAULT ''
      END
    `)
  } catch (e) { console.log('批次管理表迁移跳过或已存在') }

  // finished_goods_inventory safety_stock_quantity
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'finished_goods_inventory' AND COLUMN_NAME = 'safety_stock_quantity')
      BEGIN
        ALTER TABLE finished_goods_inventory ADD safety_stock_quantity DECIMAL(18,4) DEFAULT 0
      END
    `)
  } catch (e) { console.log('finished_goods_inventory safety_stock_quantity 迁移跳过或已存在') }

  // quality_status 列
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'finished_batch_inventory' AND COLUMN_NAME = 'quality_status')
        ALTER TABLE finished_batch_inventory ADD quality_status NVARCHAR(20) DEFAULT N'合格品';
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'finished_goods_inventory' AND COLUMN_NAME = 'quality_status')
        ALTER TABLE finished_goods_inventory ADD quality_status NVARCHAR(20) DEFAULT N'合格品';
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'inventory_transaction' AND COLUMN_NAME = 'quality_status')
        ALTER TABLE inventory_transaction ADD quality_status NVARCHAR(20) DEFAULT N'合格品';
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'stock_count_detail' AND COLUMN_NAME = 'quality_status')
        ALTER TABLE stock_count_detail ADD quality_status NVARCHAR(20) DEFAULT N'合格品'
    `)
  } catch (e) { console.log('quality_status 列迁移跳过或已存在') }

  // production_inbound_order + detail
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='production_inbound_order' AND xtype='U')
      CREATE TABLE production_inbound_order (
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
        creation_date DATETIME DEFAULT GETDATE()
      )
    `)
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_pio_number')
      CREATE UNIQUE INDEX IX_pio_number ON production_inbound_order(inbound_order_number)
    `)
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='production_inbound_order_detail' AND xtype='U')
      CREATE TABLE production_inbound_order_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        inbound_order_number NVARCHAR(50) NOT NULL,
        line_number INT DEFAULT 1,
        production_order_number NVARCHAR(50),
        item_number NVARCHAR(50),
        item_name NVARCHAR(200),
        specifications NVARCHAR(200),
        basic_unit NVARCHAR(20),
        product_drawing_number NVARCHAR(100),
        batch_number NVARCHAR(50),
        planned_quantity DECIMAL(18,4) DEFAULT 0,
        inbound_quantity DECIMAL(18,4) DEFAULT 0,
        quality_status NVARCHAR(20) DEFAULT N'合格品',
        transaction_number NVARCHAR(50),
        remark NVARCHAR(500),
        creation_date DATETIME DEFAULT GETDATE()
      )
    `)
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_piod_order')
      CREATE INDEX IX_piod_order ON production_inbound_order_detail(inbound_order_number)
    `)
  } catch (e) { console.log('production_inbound_order 表迁移跳过或已存在') }

  // accounting_period 字段添加到库存相关表
  try {
    const apTables = ['inventory_transaction', 'shipping_order', 'abnormal_io_request', 'return_order']
    for (const tbl of apTables) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tbl}' AND COLUMN_NAME = 'accounting_period')
        BEGIN
          ALTER TABLE ${tbl} ADD accounting_period NVARCHAR(10) NULL
        END
      `)
    }
  } catch (e) { console.log('accounting_period 字段迁移跳过或已存在') }
}
