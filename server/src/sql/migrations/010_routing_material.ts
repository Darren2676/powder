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

    // 创建 routing_detail_material 子表
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='routing_detail_material' AND xtype='U')
      CREATE TABLE routing_detail_material (
        id INT IDENTITY(1,1) PRIMARY KEY,
        routing_detail_id INT NOT NULL,
        material_number VARCHAR(50) DEFAULT '',
        material_name NVARCHAR(200) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        unit VARCHAR(20) DEFAULT '',
        wastage_rate DECIMAL(18,4) DEFAULT 0,
        remark NVARCHAR(500) DEFAULT ''
      )
    `);
    console.log('routing_detail_material 表创建成功（或已存在）');

    // 历史数据回填：将 routing_detail 中已有的单物料字段迁移到子表
    try {
      const [rows]: any = await sequelize.query(`
        SELECT id, process_material_input_number, process_material_input_quantity,
               process_material_input_unit, material_wastage_rate
        FROM routing_detail
        WHERE ISNULL(process_material_input_number, '') <> ''
          AND id NOT IN (SELECT routing_detail_id FROM routing_detail_material)
      `);
      if (rows.length > 0) {
        for (const row of rows) {
          await sequelize.query(`
            INSERT INTO routing_detail_material (routing_detail_id, material_number, material_name, quantity, unit, wastage_rate, remark)
            VALUES (:routing_detail_id, :material_number, '', :quantity, :unit, :wastage_rate, '')
          `, {
            replacements: {
              routing_detail_id: row.id,
              material_number: row.process_material_input_number || '',
              quantity: parseFloat(row.process_material_input_quantity) || 0,
              unit: row.process_material_input_unit || '',
              wastage_rate: parseFloat(row.material_wastage_rate) || 0
            }
          });
        }
        console.log(`历史数据回填完成，共迁移 ${rows.length} 条物料记录`);
      } else {
        console.log('无需回填历史数据');
      }
    } catch (e) {
      console.warn('历史数据回填跳过:', e);
    }

    console.log('routing_detail_material 数据库迁移完成');
  } catch (err) {
    console.error('迁移失败:', err);
  } finally {
    await sequelize.close();
  }
}

migrate();
