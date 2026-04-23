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

const seedData = [
  { char_name: '外观', data_type: '文本型', inspect_requirement: '外观', allow_multiple: '否', upper_limit: null, standard_value: null, lower_limit: null, default_value: '' },
  { char_name: '短少', data_type: '文本型', inspect_requirement: '填写短少数量', allow_multiple: '否', upper_limit: null, standard_value: null, lower_limit: null, default_value: '0' },
  { char_name: '尺寸', data_type: '文本型', inspect_requirement: '符合图纸要求', allow_multiple: '否', upper_limit: null, standard_value: null, lower_limit: null, default_value: '0' },
  { char_name: '材质', data_type: '文本型', inspect_requirement: '符合图纸要求', allow_multiple: '否', upper_limit: null, standard_value: null, lower_limit: null, default_value: '0' },
  { char_name: 'TC90(秒)', data_type: '计量型', inspect_requirement: 'TC90(秒)', allow_multiple: '否', upper_limit: 270, standard_value: 240, lower_limit: 210, default_value: '' },
  { char_name: 'TC10(秒)', data_type: '计量型', inspect_requirement: 'TC10(秒)', allow_multiple: '否', upper_limit: 120, standard_value: 100, lower_limit: 80, default_value: '' },
  { char_name: '拉断伸长率≥225', data_type: '计量型', inspect_requirement: '拉断伸长率≥225', allow_multiple: '否', upper_limit: 500, standard_value: 225, lower_limit: 225, default_value: '' },
  { char_name: '拉断强度≥10', data_type: '计量型', inspect_requirement: '拉断强度≥10', allow_multiple: '否', upper_limit: 30, standard_value: 10, lower_limit: 10, default_value: '' },
  { char_name: '密度', data_type: '计量型', inspect_requirement: '密度', allow_multiple: '否', upper_limit: 1.32, standard_value: 1.3, lower_limit: 1.28, default_value: '' },
  { char_name: '硬度（邵A）', data_type: '计量型', inspect_requirement: '硬度（邵A）', allow_multiple: '否', upper_limit: 75, standard_value: 73, lower_limit: 70, default_value: '' },
  { char_name: '拉断伸长率≥250', data_type: '计量型', inspect_requirement: '拉断伸长率≥250', allow_multiple: '否', upper_limit: 500, standard_value: 250, lower_limit: 250, default_value: '' },
  { char_name: '拉断强度≥14', data_type: '计量型', inspect_requirement: '拉断强度≥14', allow_multiple: '否', upper_limit: 30, standard_value: 14, lower_limit: 14, default_value: '' },
  { char_name: '拉断伸长率≥175', data_type: '计量型', inspect_requirement: '拉断伸长率≥175', allow_multiple: '否', upper_limit: 500, standard_value: 175, lower_limit: 175, default_value: '' },
  { char_name: '拉断强度≥11', data_type: '计量型', inspect_requirement: '拉断强度≥11', allow_multiple: '否', upper_limit: 30, standard_value: 11, lower_limit: 11, default_value: '' },
  { char_name: '拉断伸长率≥220', data_type: '计量型', inspect_requirement: '拉断伸长率≥220', allow_multiple: '否', upper_limit: 500, standard_value: 220, lower_limit: 220, default_value: '' },
  { char_name: '拉断伸长率≥300', data_type: '计量型', inspect_requirement: '拉断伸长率≥300', allow_multiple: '否', upper_limit: 500, standard_value: 300, lower_limit: 300, default_value: '' },
  { char_name: '拉断伸长率≥350', data_type: '计量型', inspect_requirement: '拉断伸长率≥350', allow_multiple: '否', upper_limit: 500, standard_value: 350, lower_limit: 350, default_value: '' },
  { char_name: '拉断强度≥8', data_type: '计量型', inspect_requirement: '拉断强度≥8', allow_multiple: '否', upper_limit: 30, standard_value: 8, lower_limit: 8, default_value: '' },
  { char_name: '拉断强度≥4', data_type: '计量型', inspect_requirement: '拉断强度≥4', allow_multiple: '否', upper_limit: 30, standard_value: 4, lower_limit: 4, default_value: '' },
  { char_name: '拉断伸长率≥150', data_type: '计量型', inspect_requirement: '拉断伸长率≥150', allow_multiple: '否', upper_limit: 500, standard_value: 150, lower_limit: 150, default_value: '' },
  { char_name: '拉断伸长率≥200', data_type: '计量型', inspect_requirement: '拉断伸长率≥200', allow_multiple: '否', upper_limit: 500, standard_value: 200, lower_limit: 200, default_value: '' },
  { char_name: '拉断伸长率≥400', data_type: '计量型', inspect_requirement: '拉断伸长率≥400', allow_multiple: '否', upper_limit: 700, standard_value: 400, lower_limit: 400, default_value: '' },
  { char_name: '拉断伸长率≥160', data_type: '计量型', inspect_requirement: '拉断伸长率≥160', allow_multiple: '否', upper_limit: 500, standard_value: 160, lower_limit: 160, default_value: '' },
  { char_name: '拉断强度≥12', data_type: '计量型', inspect_requirement: '拉断强度≥12', allow_multiple: '否', upper_limit: 30, standard_value: 12, lower_limit: 12, default_value: '' },
  { char_name: '拉断强度≥6', data_type: '计量型', inspect_requirement: '拉断强度≥6', allow_multiple: '否', upper_limit: 30, standard_value: 6, lower_limit: 6, default_value: '' },
  { char_name: '拉断强度≥7', data_type: '计量型', inspect_requirement: '拉断强度≥7', allow_multiple: '否', upper_limit: 30, standard_value: 7, lower_limit: 7, default_value: '' },
  { char_name: '拉断伸长率≥140', data_type: '计量型', inspect_requirement: '拉断伸长率≥140', allow_multiple: '否', upper_limit: 500, standard_value: 140, lower_limit: 140, default_value: '' },
  { char_name: '拉断强度≥4.5', data_type: '计量型', inspect_requirement: '拉断强度≥4.5', allow_multiple: '否', upper_limit: 30, standard_value: 4.5, lower_limit: 4.5, default_value: '' },
  { char_name: '拉断强度≥5', data_type: '计量型', inspect_requirement: '拉断强度≥5', allow_multiple: '否', upper_limit: 30, standard_value: 5, lower_limit: 5, default_value: '' },
];

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='quality_characteristic' AND xtype='U')
      CREATE TABLE quality_characteristic (
        char_name NVARCHAR(100) NOT NULL PRIMARY KEY,
        data_type NVARCHAR(20) DEFAULT '',
        inspect_requirement NVARCHAR(500) DEFAULT '',
        allow_multiple NVARCHAR(10) DEFAULT N'否',
        upper_limit DECIMAL(18,4) NULL,
        standard_value DECIMAL(18,4) NULL,
        lower_limit DECIMAL(18,4) NULL,
        single_options NVARCHAR(500) DEFAULT '',
        multi_options NVARCHAR(500) DEFAULT '',
        qualified_options NVARCHAR(500) DEFAULT '',
        default_value NVARCHAR(200) DEFAULT ''
      )
    `);
    console.log('quality_characteristic 表创建成功');

    let inserted = 0;
    for (const item of seedData) {
      try {
        await sequelize.query(
          `IF NOT EXISTS (SELECT 1 FROM quality_characteristic WHERE char_name = :char_name)
           INSERT INTO quality_characteristic (char_name, data_type, inspect_requirement, allow_multiple, upper_limit, standard_value, lower_limit, default_value)
           VALUES (:char_name, :data_type, :inspect_requirement, :allow_multiple, :upper_limit, :standard_value, :lower_limit, :default_value)`,
          { replacements: item }
        );
        inserted++;
      } catch (e: any) {
        console.log(`跳过: ${item.char_name} - ${e.message}`);
      }
    }
    console.log(`种子数据导入完成: ${inserted}/${seedData.length} 条`);

    await sequelize.close();
    console.log('迁移完成');
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
