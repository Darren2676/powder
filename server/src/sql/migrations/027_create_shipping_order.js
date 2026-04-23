/**
 * 创建发货单相关表
 * 运行: node src/sql/migrations/027_create_shipping_order.js
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

    // 1. 发货单主表
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'shipping_order')
      BEGIN
        CREATE TABLE shipping_order (
          id INT IDENTITY(1,1) PRIMARY KEY,
          shipping_order_number NVARCHAR(50) NOT NULL,
          customer_number NVARCHAR(50) DEFAULT '',
          customer_name NVARCHAR(200) DEFAULT '',
          warehouse_number NVARCHAR(50) DEFAULT '',
          warehouse_name NVARCHAR(200) DEFAULT '',
          shipping_date DATETIME DEFAULT GETDATE(),
          status NVARCHAR(20) DEFAULT N'已发货',
          carrier NVARCHAR(200) DEFAULT '',
          tracking_number NVARCHAR(100) DEFAULT '',
          freight DECIMAL(18,2) DEFAULT 0,
          shipping_address NVARCHAR(500) DEFAULT '',
          contact_person NVARCHAR(100) DEFAULT '',
          contact_phone NVARCHAR(50) DEFAULT '',
          remark NVARCHAR(500) DEFAULT '',
          creation_man NVARCHAR(100) DEFAULT '',
          creation_date DATETIME DEFAULT GETDATE(),
          CONSTRAINT UQ_so_shipping_order_number UNIQUE (shipping_order_number)
        );
        CREATE INDEX IX_so_customer ON shipping_order(customer_number);
        CREATE INDEX IX_so_status ON shipping_order(status);
        CREATE INDEX IX_so_shipping_date ON shipping_order(shipping_date);
        CREATE INDEX IX_so_creation_date ON shipping_order(creation_date);
        PRINT '表 shipping_order 创建成功';
      END
      ELSE
        PRINT '表 shipping_order 已存在';
    `);

    // 2. 发货单明细表
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'shipping_order_detail')
      BEGIN
        CREATE TABLE shipping_order_detail (
          id INT IDENTITY(1,1) PRIMARY KEY,
          shipping_order_number NVARCHAR(50) NOT NULL,
          line_number INT DEFAULT 1,
          request_number NVARCHAR(50) DEFAULT '',
          sales_order_number NVARCHAR(50) DEFAULT '',
          sales_detail_id INT DEFAULT 0,
          item_number NVARCHAR(100) NOT NULL,
          item_name NVARCHAR(200) DEFAULT '',
          specifications NVARCHAR(200) DEFAULT '',
          basic_unit NVARCHAR(50) DEFAULT '',
          product_drawing_number NVARCHAR(100) DEFAULT '',
          quantity DECIMAL(18,4) DEFAULT 0,
          remark NVARCHAR(500) DEFAULT ''
        );
        CREATE INDEX IX_sod_order_number ON shipping_order_detail(shipping_order_number);
        CREATE INDEX IX_sod_item ON shipping_order_detail(item_number);
        PRINT '表 shipping_order_detail 创建成功';
      END
      ELSE
        PRINT '表 shipping_order_detail 已存在';
    `);

    // 3. 发货单批次明细表
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'shipping_order_batch')
      BEGIN
        CREATE TABLE shipping_order_batch (
          id INT IDENTITY(1,1) PRIMARY KEY,
          shipping_order_number NVARCHAR(50) NOT NULL,
          detail_id INT NOT NULL,
          item_number NVARCHAR(100) DEFAULT '',
          batch_number NVARCHAR(50) DEFAULT '',
          quantity DECIMAL(18,4) DEFAULT 0
        );
        CREATE INDEX IX_sob_order_number ON shipping_order_batch(shipping_order_number);
        CREATE INDEX IX_sob_detail ON shipping_order_batch(detail_id);
        PRINT '表 shipping_order_batch 创建成功';
      END
      ELSE
        PRINT '表 shipping_order_batch 已存在';
    `);

    console.log('所有表创建完成');
  } catch (error) {
    console.error('创建表失败:', error);
  } finally {
    await sequelize.close();
  }
}

createTables();
