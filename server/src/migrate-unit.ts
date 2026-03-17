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

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='unit' AND xtype='U')
      CREATE TABLE unit (
        unit_code NVARCHAR(20) NOT NULL PRIMARY KEY,
        unit_name NVARCHAR(50) NOT NULL,
        remark NVARCHAR(500) DEFAULT ''
      )
    `);
    console.log('unit 表创建成功');

    // 插入初始数据（如果不存在）
    const initData = [
      { unit_code: '01', unit_name: 'PCS' },
      { unit_code: '02', unit_name: 'KG' },
      { unit_code: '03', unit_name: 'G' }
    ];
    for (const item of initData) {
      await sequelize.query(
        `IF NOT EXISTS (SELECT 1 FROM unit WHERE unit_code = :unit_code)
         INSERT INTO unit (unit_code, unit_name, remark) VALUES (:unit_code, :unit_name, '')`,
        { replacements: item }
      );
    }
    console.log('初始数据插入成功: 01-PCS, 02-KG, 03-G');

    await sequelize.close();
    console.log('迁移完成');
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
