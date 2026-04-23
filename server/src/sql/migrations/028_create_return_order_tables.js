/**
 * 创建退货单相关表
 * 运行: node src/sql/migrations/028_create_return_order_tables.js
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '1433'),
    dialect: 'mssql',
    logging: false,
    dialectOptions: {
      options: {
        encrypt: false,
        trustServerCertificate: true
      }
    }
  }
);

async function createTables() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 1. 退货单主表
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'return_order')
      BEGIN
        CREATE TABLE return_order (
          id INT IDENTITY(1,1) PRIMARY KEY,
          return_order_number NVARCHAR(50) NOT NULL,
          type NVARCHAR(20) NOT NULL DEFAULT N'退款退货',
          shipping_order_number NVARCHAR(50) NOT NULL,
          customer_number NVARCHAR(50) DEFAULT '',
          customer_name NVARCHAR(200) DEFAULT '',
          warehouse_number NVARCHAR(50) DEFAULT '',
          warehouse_name NVARCHAR(200) DEFAULT '',
          status NVARCHAR(20) DEFAULT N'待确认',
          reason NVARCHAR(500) DEFAULT '',
          remark NVARCHAR(500) DEFAULT '',
          confirm_remark NVARCHAR(500) DEFAULT '',
          creation_man NVARCHAR(100) DEFAULT '',
          creation_date DATETIME DEFAULT GETDATE(),
          confirmed_by NVARCHAR(100) DEFAULT '',
          confirmed_date DATETIME NULL,
          CONSTRAINT UQ_ro_return_order_number UNIQUE (return_order_number)
        );
        CREATE INDEX IX_ro_shipping_order ON return_order(shipping_order_number);
        CREATE INDEX IX_ro_customer ON return_order(customer_number);
        CREATE INDEX IX_ro_status ON return_order(status);
        CREATE INDEX IX_ro_type ON return_order(type);
        CREATE INDEX IX_ro_creation_date ON return_order(creation_date);
        PRINT '表 return_order 创建成功';
      END
      ELSE
        PRINT '表 return_order 已存在';
    `);

    // 2. 退货单明细表
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'return_order_detail')
      BEGIN
        CREATE TABLE return_order_detail (
          id INT IDENTITY(1,1) PRIMARY KEY,
          return_order_number NVARCHAR(50) NOT NULL,
          line_number INT DEFAULT 1,
          shipping_order_detail_id INT DEFAULT 0,
          sales_order_number NVARCHAR(50) DEFAULT '',
          sales_detail_id INT DEFAULT 0,
          item_number NVARCHAR(100) NOT NULL,
          item_name NVARCHAR(200) DEFAULT '',
          specifications NVARCHAR(200) DEFAULT '',
          basic_unit NVARCHAR(50) DEFAULT '',
          product_drawing_number NVARCHAR(100) DEFAULT '',
          shipped_quantity DECIMAL(18,4) DEFAULT 0,
          return_quantity DECIMAL(18,4) DEFAULT 0,
          remark NVARCHAR(500) DEFAULT ''
        );
        CREATE INDEX IX_rod_order_number ON return_order_detail(return_order_number);
        CREATE INDEX IX_rod_shipping_detail ON return_order_detail(shipping_order_detail_id);
        CREATE INDEX IX_rod_sales_detail ON return_order_detail(sales_detail_id);
        CREATE INDEX IX_rod_item ON return_order_detail(item_number);
        PRINT '表 return_order_detail 创建成功';
      END
      ELSE
        PRINT '表 return_order_detail 已存在';
    `);

    // 3. 退货单批次明细表
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'return_order_batch')
      BEGIN
        CREATE TABLE return_order_batch (
          id INT IDENTITY(1,1) PRIMARY KEY,
          return_order_number NVARCHAR(50) NOT NULL,
          detail_id INT NOT NULL,
          batch_number NVARCHAR(50) DEFAULT '',
          quantity DECIMAL(18,4) DEFAULT 0
        );
        CREATE INDEX IX_rob_order_number ON return_order_batch(return_order_number);
        CREATE INDEX IX_rob_detail ON return_order_batch(detail_id);
        PRINT '表 return_order_batch 创建成功';
      END
      ELSE
        PRINT '表 return_order_batch 已存在';
    `);

    // 4. sales_order_detail 添加 refunded_quantity 字段
    await sequelize.query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'sales_order_detail' AND COLUMN_NAME = 'refunded_quantity'
      )
      BEGIN
        ALTER TABLE sales_order_detail ADD refunded_quantity DECIMAL(18,4) DEFAULT 0;
        PRINT '字段 sales_order_detail.refunded_quantity 添加成功';
      END
      ELSE
        PRINT '字段 sales_order_detail.refunded_quantity 已存在';
    `);

    console.log('所有表创建/修改完成');
  } catch (error) {
    console.error('创建表失败:', error);
  } finally {
    await sequelize.close();
  }
}

createTables();
