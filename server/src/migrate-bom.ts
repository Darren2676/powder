import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize({
  dialect: 'mssql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME || 'XYMES',
  username: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  logging: false,
  dialectOptions: { options: { encrypt: false, trustServerCertificate: true } }
});

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 创建 bom_header 表
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='bom_header' AND xtype='U')
      CREATE TABLE bom_header (
        bom_number VARCHAR(50) NOT NULL PRIMARY KEY,
        bom_name NVARCHAR(200) DEFAULT '',
        item_number VARCHAR(50) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        bom_version VARCHAR(20) DEFAULT 'V1.0',
        bom_type VARCHAR(50) DEFAULT '',
        base_quantity DECIMAL(18,4) DEFAULT 1,
        base_unit VARCHAR(20) DEFAULT '',
        process_route_number VARCHAR(50) DEFAULT '',
        [condition] VARCHAR(20) DEFAULT N'启用',
        approval_status VARCHAR(20) DEFAULT N'草稿',
        remark NVARCHAR(500) DEFAULT '',
        creation_date VARCHAR(50) DEFAULT '',
        creation_man VARCHAR(50) DEFAULT ''
      )
    `);
    console.log('bom_header 表创建成功（或已存在）');

    // 创建 bom_detail 表
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='bom_detail' AND xtype='U')
      CREATE TABLE bom_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        bom_number VARCHAR(50) NOT NULL,
        line_number INT DEFAULT 10,
        material_number VARCHAR(50) DEFAULT '',
        material_name NVARCHAR(200) DEFAULT '',
        material_type VARCHAR(50) DEFAULT '',
        standard_quantity DECIMAL(18,4) DEFAULT 0,
        unit VARCHAR(20) DEFAULT '',
        wastage_rate DECIMAL(18,4) DEFAULT 0,
        actual_quantity DECIMAL(18,4) DEFAULT 0,
        step_number INT DEFAULT NULL,
        is_key_material INT DEFAULT 0,
        substitute_group VARCHAR(50) DEFAULT '',
        substitute_priority INT DEFAULT 0,
        supply_type VARCHAR(50) DEFAULT '',
        default_warehouse VARCHAR(50) DEFAULT '',
        remark NVARCHAR(500) DEFAULT ''
      )
    `);
    console.log('bom_detail 表创建成功（或已存在）');

    console.log('BOM 数据库迁移完成');
  } catch (err) {
    console.error('迁移失败:', err);
  } finally {
    await sequelize.close();
  }
}

migrate();
