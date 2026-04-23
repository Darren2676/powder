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

// 默认检验员
const DEF_ID = '20190301；20230101';
const DEF_NAME = '李志伟；张苏宁';

// 标准记录生成（大多数记录共享相同字段）
function std(plan_name: string, applied_category = '') {
  return {
    plan_name,
    inspector_id: DEF_ID,
    inspector_name: DEF_NAME,
    inspect_department: '',
    inspect_method: '抽检',
    sampling_method: '按数量',
    sampling_quantity: 1,
    decimal_handling: '',
    is_destructive: '非破坏性检验',
    applied_category
  };
}

const seedData = [
  std('E7020'),
  std('A650J'),
  std('F7106M'),
  std('M701K'),
  std('F7106G'),
  std('FVQ502C'),
  std('Q603'),
  std('FVQ704C'),
  std('M803K'),
  std('N7017'),
  std('N7016'),
  std('Q401'),
  std('E7501KP'),
  std('N504G'),
  std('E6020'),
  std('E618'),
  std('F7105K'),
  std('E6007ZR'),
  std('Q501C'),
  std('FVQ703C'),
  std('E5003'),
  std('E6004KP'),
  std('C5001R'),
  std('F7105KZ'),
  std('N7020'),
  std('N7002Q', '胶料'),
  std('FS6501C'),
  std('M602K'),
  std('N7010L'),
  std('FVQ702C'),
  std('N8005'),
  std('N8002'),
  std('N6502'),
  std('E7005KP'),
  std('M704K'),
  std('N7003G'),
  std('N6501'),
  std('Q301'),
  std('FVQ706C'),
  std('E8001KPS'),
  std('F6002TG'),
  std('N716K'),
  std('N716J'),
  std('N5502'),
  std('F7001'),
  std('N7011K'),
  std('F800'),
  std('Q503C'),
  std('R6001'),
  std('N7004'),
  std('FVQ701C'),
  std('M606K'),
  std('M901K'),
  std('E7006C'),
  std('E6005KP'),
  std('E7701KP'),
  std('E740BP'),
  std('E7020C'),
  std('A650JC'),
  std('F7106MC'),
  std('M701KC'),
  std('F7106GC'),
  std('Q603C'),
  std('M803KC'),
  std('N7017C'),
  std('N7016C'),
  std('Q401C'),
  std('E7501KPC'),
  std('N504GC'),
  std('E6020C'),
  std('E618C'),
  std('F7105KC'),
  std('E6007ZRC'),
  std('FVQ703CC'),
  std('E5003C'),
  std('E6004KPC'),
  std('C5001RC'),
  std('F7105KZC'),
  std('N7020C'),
  std('N7002QC'),
  std('FS6501CC'),
  std('M602KC'),
  std('N7010LC'),
  std('N8005C'),
  std('N8002C'),
  std('N6502C'),
  std('E7005KPC'),
  {
    plan_name: '胶料检验',
    inspector_id: '20190301；20210801',
    inspector_name: '李志伟；李海霞',
    inspect_department: '',
    inspect_method: '抽检',
    sampling_method: '按数量',
    sampling_quantity: 1,
    decimal_handling: '',
    is_destructive: '非破坏性检验',
    applied_category: ''
  }
];

async function run() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 确保表存在
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='incoming_inspect_plan' AND xtype='U')
      CREATE TABLE incoming_inspect_plan (
        plan_name NVARCHAR(100) NOT NULL PRIMARY KEY,
        inspector_id NVARCHAR(200) DEFAULT '',
        inspector_name NVARCHAR(200) DEFAULT '',
        inspect_department NVARCHAR(100) DEFAULT '',
        inspect_method NVARCHAR(50) DEFAULT '',
        sampling_method NVARCHAR(50) DEFAULT '',
        sampling_quantity INT DEFAULT 0,
        decimal_handling NVARCHAR(50) DEFAULT '',
        is_destructive NVARCHAR(50) DEFAULT '',
        applied_category NVARCHAR(200) DEFAULT ''
      )
    `);

    // 清空旧数据并重新插入
    await sequelize.query(`DELETE FROM incoming_inspect_plan`);
    console.log('已清空旧数据');

    let count = 0;
    for (const item of seedData) {
      await sequelize.query(`
        INSERT INTO incoming_inspect_plan (plan_name, inspector_id, inspector_name, inspect_department,
          inspect_method, sampling_method, sampling_quantity, decimal_handling, is_destructive, applied_category)
        VALUES (:plan_name, :inspector_id, :inspector_name, :inspect_department,
          :inspect_method, :sampling_method, :sampling_quantity, :decimal_handling, :is_destructive, :applied_category)
      `, { replacements: item });
      count++;
    }

    console.log(`收料检验方案种子数据导入完成: ${count} 条记录`);

    const [result]: any = await sequelize.query(`SELECT COUNT(*) as total FROM incoming_inspect_plan`);
    console.log(`数据库中共 ${result[0].total} 条记录`);

  } catch (err) {
    console.error('种子脚本执行失败:', err);
  } finally {
    await sequelize.close();
  }
}

run();
