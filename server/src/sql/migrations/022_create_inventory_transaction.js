/**
 * 创建新核云出入库记录表
 * 用于存储通过 Webhook 接收的出入库事务数据
 *
 * 运行: node src/sql/migrations/022_create_inventory_transaction.js
 */

const { Sequelize } = require('sequelize');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '1433'),
    dialect: 'mssql',
    dialectOptions: {
      options: {
        encrypt: false,
        trustServerCertificate: true,
        tdsVersion: '7_2'
      }
    },
    logging: false
  }
);

async function createTables() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 出入库主表
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='xhy_inventory_transaction' AND xtype='U')
      CREATE TABLE xhy_inventory_transaction (
        id INT IDENTITY(1,1) PRIMARY KEY,
        request_id NVARCHAR(100),
        business_type INT,
        xhy_id INT,
        code NVARCHAR(100),
        source_code NVARCHAR(100),
        staff_code NVARCHAR(50),
        operation_type_id INT,
        operation_type NVARCHAR(50),
        operation_type_name NVARCHAR(100),
        comments NVARCHAR(500),
        xhy_create_time NVARCHAR(50),
        xhy_operation_time NVARCHAR(50),
        received_at DATETIME DEFAULT GETDATE(),
        raw_json NVARCHAR(MAX),
        CONSTRAINT UQ_xhy_inv_txn_request_id UNIQUE (request_id)
      )
    `);
    console.log('xhy_inventory_transaction 表创建成功');

    // 出入库明细表
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='xhy_inventory_transaction_detail' AND xtype='U')
      CREATE TABLE xhy_inventory_transaction_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        transaction_id INT NOT NULL,
        xhy_record_id INT,
        item_code NVARCHAR(100),
        item_name NVARCHAR(200),
        item_unit NVARCHAR(50),
        item_specifications NVARCHAR(500),
        warehouse_code NVARCHAR(100),
        location_code NVARCHAR(100),
        another_warehouse_code NVARCHAR(100),
        another_location_code NVARCHAR(100),
        batch_number NVARCHAR(100),
        lot_car_code NVARCHAR(100),
        quantity DECIMAL(18,8) DEFAULT 0,
        qualified_quantity DECIMAL(18,8) DEFAULT 0,
        unqualified_quantity DECIMAL(18,8) DEFAULT 0,
        price DECIMAL(18,8) DEFAULT 0,
        production_unit NVARCHAR(50),
        production_unit_quantity DECIMAL(18,8) DEFAULT 0,
        inventory_unit NVARCHAR(50),
        inventory_unit_quantity DECIMAL(18,8) DEFAULT 0,
        relative_order_number NVARCHAR(100),
        relative_product_code NVARCHAR(100),
        relative_product_quantity DECIMAL(18,8) DEFAULT 0,
        applicant NVARCHAR(100),
        applicant_department NVARCHAR(200),
        comments NVARCHAR(500),
        work_order_remark NVARCHAR(500),
        check_account_date NVARCHAR(50),
        CONSTRAINT FK_xhy_inv_detail_txn FOREIGN KEY (transaction_id) REFERENCES xhy_inventory_transaction(id) ON DELETE CASCADE
      )
    `);
    console.log('xhy_inventory_transaction_detail 表创建成功');

    // 创建索引
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_xhy_inv_txn_code')
      CREATE INDEX IX_xhy_inv_txn_code ON xhy_inventory_transaction(code);
    `);
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_xhy_inv_txn_operation_type')
      CREATE INDEX IX_xhy_inv_txn_operation_type ON xhy_inventory_transaction(operation_type);
    `);
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_xhy_inv_txn_received_at')
      CREATE INDEX IX_xhy_inv_txn_received_at ON xhy_inventory_transaction(received_at);
    `);
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_xhy_inv_detail_txn_id')
      CREATE INDEX IX_xhy_inv_detail_txn_id ON xhy_inventory_transaction_detail(transaction_id);
    `);
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_xhy_inv_detail_item_code')
      CREATE INDEX IX_xhy_inv_detail_item_code ON xhy_inventory_transaction_detail(item_code);
    `);

    console.log('索引创建成功');
    console.log('全部完成!');
  } catch (err) {
    console.error('创建失败:', err.message);
  } finally {
    await sequelize.close();
  }
}

createTables();
