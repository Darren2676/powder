/**
 * 创建客户物料对照表
 */
const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize({
  dialect: 'mssql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME || 'XYMES',
  username: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  logging: console.log,
  dialectOptions: {
    options: { encrypt: false, trustServerCertificate: true, tdsVersion: '7_2' }
  }
});

async function run() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='customer_material_mapping' AND xtype='U')
      CREATE TABLE customer_material_mapping (
        id INT IDENTITY(1,1) PRIMARY KEY,
        customer_number NVARCHAR(50) NOT NULL,
        customer_name NVARCHAR(200) NOT NULL DEFAULT '',
        item_number NVARCHAR(50) NOT NULL,
        item_name NVARCHAR(200) NOT NULL DEFAULT '',
        specifications NVARCHAR(500) NOT NULL DEFAULT '',
        customer_item_number NVARCHAR(100) NOT NULL DEFAULT '',
        customer_item_description NVARCHAR(500) NOT NULL DEFAULT '',
        remark NVARCHAR(500) NOT NULL DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE(),
        update_date DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('客户物料对照表创建成功');

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='UX_customer_material_mapping' AND object_id = OBJECT_ID('customer_material_mapping'))
      CREATE UNIQUE INDEX UX_customer_material_mapping ON customer_material_mapping(customer_number, item_number, customer_item_number)
    `);
    console.log('唯一索引创建成功');

    console.log('全部完成');
  } catch (err) {
    console.error('执行失败:', err.message);
  } finally {
    await sequelize.close();
  }
}

run();
