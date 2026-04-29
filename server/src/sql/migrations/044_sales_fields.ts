/**
 * 销售域字段迁移
 * - sales_order_detail: status/shipping_status/production_status/return_status/shipped_quantity
 * - sales_forecast + detail + forecast_consumption
 * - sales_forecast_detail.status
 * - 多表 customer_item_number/customer_item_description
 */

import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  // sales_order_detail 增加 status 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order_detail' AND COLUMN_NAME = 'status')
      BEGIN
        ALTER TABLE sales_order_detail ADD status NVARCHAR(20) DEFAULT N'未开始'
      END
    `)
  } catch (e) { console.log('sales_order_detail status 迁移跳过或已存在') }

  // sales_order_detail 增加 shipping_status, production_status, return_status 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order_detail' AND COLUMN_NAME = 'shipping_status')
      BEGIN
        ALTER TABLE sales_order_detail ADD shipping_status NVARCHAR(20) DEFAULT N'未申请'
      END;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order_detail' AND COLUMN_NAME = 'production_status')
      BEGIN
        ALTER TABLE sales_order_detail ADD production_status NVARCHAR(20) DEFAULT N'未加入计划'
      END;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order_detail' AND COLUMN_NAME = 'return_status')
      BEGIN
        ALTER TABLE sales_order_detail ADD return_status NVARCHAR(20) DEFAULT N'未申请'
      END
    `)
  } catch (e) { console.log('sales_order_detail 三状态字段迁移跳过或已存在') }

  // sales_order_detail 增加 shipped_quantity 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order_detail' AND COLUMN_NAME = 'shipped_quantity')
      BEGIN
        ALTER TABLE sales_order_detail ADD shipped_quantity DECIMAL(18,4) DEFAULT 0
      END
    `)
  } catch (e) { console.log('sales_order_detail shipped_quantity 迁移跳过或已存在') }

  // sales_forecast 主表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='sales_forecast' AND xtype='U')
      CREATE TABLE sales_forecast (
        forecast_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        customer_number NVARCHAR(100) NOT NULL,
        customer_name NVARCHAR(200) DEFAULT '',
        forecast_date DATETIME DEFAULT GETDATE(),
        approval_status NVARCHAR(20) DEFAULT N'草稿',
        [condition] NVARCHAR(20) DEFAULT N'启用',
        remark NVARCHAR(500) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE(),
        creation_man NVARCHAR(100) DEFAULT ''
      )
    `)
  } catch (e) { console.log('sales_forecast 表迁移跳过或已存在') }

  // sales_forecast_detail 明细表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='sales_forecast_detail' AND xtype='U')
      CREATE TABLE sales_forecast_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        forecast_number NVARCHAR(50) NOT NULL,
        line_number INT NOT NULL,
        item_number NVARCHAR(100) NOT NULL,
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        product_drawing_number NVARCHAR(100) DEFAULT '',
        start_date DATETIME NOT NULL,
        end_date DATETIME NOT NULL,
        forecast_quantity DECIMAL(18,4) NOT NULL,
        consumed_quantity DECIMAL(18,4) DEFAULT 0,
        remaining_quantity DECIMAL(18,4) DEFAULT 0,
        consumption_status NVARCHAR(20) DEFAULT N'未消耗',
        remark NVARCHAR(500) DEFAULT ''
      )
    `)
  } catch (e) { console.log('sales_forecast_detail 表迁移跳过或已存在') }

  // forecast_consumption 预测消耗记录表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='forecast_consumption' AND xtype='U')
      CREATE TABLE forecast_consumption (
        id INT IDENTITY(1,1) PRIMARY KEY,
        forecast_detail_id INT NOT NULL,
        forecast_number NVARCHAR(50) NOT NULL,
        sales_order_number NVARCHAR(50) NOT NULL,
        sales_order_detail_id INT NOT NULL,
        item_number NVARCHAR(100) NOT NULL,
        consumed_quantity DECIMAL(18,4) NOT NULL,
        consumed_date DATETIME DEFAULT GETDATE(),
        consumed_by NVARCHAR(100) DEFAULT ''
      )
    `)
  } catch (e) { console.log('forecast_consumption 表迁移跳过或已存在') }

  // sales_forecast_detail 行状态字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sales_forecast_detail') AND name = 'status')
      ALTER TABLE sales_forecast_detail ADD status NVARCHAR(20) DEFAULT N'未开始'
    `)
    await sequelize.query(`UPDATE sales_forecast_detail SET status = N'未开始' WHERE status IS NULL`)
  } catch (e) { console.log('预测明细行状态字段迁移跳过或已存在') }

  // 多表添加 customer_item_number 和 customer_item_description 字段
  try {
    const tables = [
      'sales_order_detail',
      'sales_forecast_detail',
      'Production_plan',
      'shipping_request_detail',
      'shipping_order_detail',
      'return_order_detail'
    ]
    for (const tableName of tables) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}' AND COLUMN_NAME = 'customer_item_number')
          ALTER TABLE ${tableName} ADD customer_item_number NVARCHAR(100) DEFAULT '';
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}' AND COLUMN_NAME = 'customer_item_description')
          ALTER TABLE ${tableName} ADD customer_item_description NVARCHAR(500) DEFAULT ''
      `)
    }
  } catch (e) { console.log('客户物料号字段迁移跳过或已存在') }
}
