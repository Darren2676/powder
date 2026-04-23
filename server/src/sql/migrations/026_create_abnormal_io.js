/**
 * 创建异常出入库相关表
 * 运行: node src/sql/migrations/026_create_abnormal_io.js
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

    // 1. 异常出入库申请单头
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'abnormal_io_request')
      BEGIN
        CREATE TABLE abnormal_io_request (
          id INT IDENTITY(1,1) PRIMARY KEY,
          request_number NVARCHAR(50) NOT NULL,
          type NVARCHAR(20) NOT NULL,
          status NVARCHAR(20) DEFAULT N'待确认',
          customer_number NVARCHAR(50) DEFAULT '',
          customer_name NVARCHAR(200) DEFAULT '',
          original_shipping_number NVARCHAR(50) DEFAULT '',
          warehouse_number NVARCHAR(50) DEFAULT '',
          warehouse_name NVARCHAR(200) DEFAULT '',
          target_warehouse_number NVARCHAR(50) DEFAULT '',
          target_warehouse_name NVARCHAR(200) DEFAULT '',
          reason NVARCHAR(500) DEFAULT '',
          remark NVARCHAR(500) DEFAULT '',
          creation_man NVARCHAR(100) DEFAULT '',
          creation_date DATETIME DEFAULT GETDATE(),
          confirmed_by NVARCHAR(100) DEFAULT '',
          confirmed_date DATETIME NULL,
          confirm_remark NVARCHAR(500) DEFAULT '',
          CONSTRAINT UQ_aior_request_number UNIQUE (request_number)
        );
        CREATE INDEX IX_aior_type ON abnormal_io_request(type);
        CREATE INDEX IX_aior_status ON abnormal_io_request(status);
        CREATE INDEX IX_aior_creation_date ON abnormal_io_request(creation_date);
        PRINT '表 abnormal_io_request 创建成功';
      END
      ELSE
        PRINT '表 abnormal_io_request 已存在';
    `);

    // 2. 异常出入库明细行
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'abnormal_io_request_detail')
      BEGIN
        CREATE TABLE abnormal_io_request_detail (
          id INT IDENTITY(1,1) PRIMARY KEY,
          request_number NVARCHAR(50) NOT NULL,
          line_number INT DEFAULT 1,
          item_number NVARCHAR(100) NOT NULL,
          item_name NVARCHAR(200) DEFAULT '',
          specifications NVARCHAR(200) DEFAULT '',
          basic_unit NVARCHAR(50) DEFAULT '',
          product_drawing_number NVARCHAR(100) DEFAULT '',
          batch_number NVARCHAR(50) DEFAULT '',
          quantity DECIMAL(18,4) DEFAULT 0,
          system_quantity DECIMAL(18,4) DEFAULT 0,
          actual_quantity DECIMAL(18,4) DEFAULT 0,
          difference_quantity DECIMAL(18,4) DEFAULT 0,
          remark NVARCHAR(500) DEFAULT ''
        );
        CREATE INDEX IX_aiord_request ON abnormal_io_request_detail(request_number);
        CREATE INDEX IX_aiord_item ON abnormal_io_request_detail(item_number);
        PRINT '表 abnormal_io_request_detail 创建成功';
      END
      ELSE
        PRINT '表 abnormal_io_request_detail 已存在';
    `);

    console.log('所有表创建完成');
  } catch (error) {
    console.error('创建表失败:', error);
  } finally {
    await sequelize.close();
  }
}

createTables();
