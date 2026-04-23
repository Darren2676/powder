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

// 全检方案辅助
function fullPlan(inspect_type: string, plan_name: string) {
  return {
    plan_name, inspect_type, is_full_inspect: '是', is_sampling: '否',
    sampling_trigger: '', sampling_type: '', sampling_ratio: 0, decimal_handling: '',
    sampling_quantity: 0, sampling_range_type: '', sampling_quantity_range: 0, sampling_batch_range: 0,
    is_first_inspect: '否', first_inspect_time: '', first_inspect_quantity: 0,
    is_last_inspect: '否', last_inspect_quantity: 0
  };
}

// 按比例抽检方案辅助
function ratioPlan(inspect_type: string, plan_name: string, ratio: number) {
  return {
    plan_name, inspect_type, is_full_inspect: '否', is_sampling: '是',
    sampling_trigger: '自动', sampling_type: '按比例', sampling_ratio: ratio, decimal_handling: '向上取整',
    sampling_quantity: 0, sampling_range_type: '按批量', sampling_quantity_range: 0, sampling_batch_range: 1,
    is_first_inspect: '否', first_inspect_time: '', first_inspect_quantity: 0,
    is_last_inspect: '否', last_inspect_quantity: 0
  };
}

// 按数量抽检方案辅助（材料类）
function quantityPlan(plan_name: string) {
  return {
    plan_name, inspect_type: '专检', is_full_inspect: '否', is_sampling: '是',
    sampling_trigger: '自动', sampling_type: '按数量', sampling_ratio: 0, decimal_handling: '',
    sampling_quantity: 1, sampling_range_type: '按批量', sampling_quantity_range: 0, sampling_batch_range: 1,
    is_first_inspect: '否', first_inspect_time: '', first_inspect_quantity: 0,
    is_last_inspect: '否', last_inspect_quantity: 0
  };
}

const seedData = [
  // 全检方案
  fullPlan('专检', '生产全检'),
  fullPlan('自检', '巡检'),
  fullPlan('自检', '包装自检'),
  fullPlan('自检', '生产过程检'),
  fullPlan('自检', '硫化自检'),
  fullPlan('自检', '机加自检'),
  fullPlan('专检', '机加全检'),
  fullPlan('自检', '机加巡检'),

  // 按比例抽检
  ratioPlan('专检', '生产抽检', 5),
  ratioPlan('专检', '机加抽检', 5),

  // 材料按数量抽检（专检）
  quantityPlan('FVQ502C'),
  quantityPlan('A650J'),
  quantityPlan('FVQ701C'),
  quantityPlan('C5001R'),
  quantityPlan('R6001'),
  quantityPlan('Q603'),
  quantityPlan('Q301'),
  quantityPlan('Q503C'),
  quantityPlan('Q501C'),
  quantityPlan('Q401'),
  quantityPlan('M803K'),
  quantityPlan('M606K'),
  quantityPlan('M704K'),
  quantityPlan('M901K'),
  quantityPlan('M701K'),
  quantityPlan('M602K'),
  quantityPlan('FS6501C'),
  quantityPlan('F6002TG'),
  quantityPlan('F800'),
  quantityPlan('F7001'),
  quantityPlan('F7106M'),
  quantityPlan('F7106G'),
  quantityPlan('F7105KZ'),
  quantityPlan('F7105K'),
  quantityPlan('E7006C'),
  quantityPlan('E8001KPS'),
  quantityPlan('E6007ZR'),
  quantityPlan('E6005KP'),
  quantityPlan('E7701KP'),
  quantityPlan('E6004KP'),
  quantityPlan('E618'),
  quantityPlan('E740BP'),
  quantityPlan('E7020'),
  quantityPlan('E7005KP'),
  quantityPlan('E7501KP'),
  quantityPlan('E6020'),
  quantityPlan('E5502'),
  quantityPlan('E5003'),
  quantityPlan('N8005'),
  quantityPlan('N8002'),
  quantityPlan('N727'),
  quantityPlan('N6502'),
  quantityPlan('N504G'),
  quantityPlan('N7020'),
  quantityPlan('N605'),
  quantityPlan('N7006'),
  quantityPlan('N7011K'),
  quantityPlan('N5502'),
  quantityPlan('N7017'),
  quantityPlan('N7016'),
  quantityPlan('N7010L'),
  quantityPlan('N716J'),
  quantityPlan('N716K'),
  quantityPlan('N6501'),
  quantityPlan('N7003G'),
  quantityPlan('N7004'),
  quantityPlan('N7003'),
  quantityPlan('N7002Q'),
  quantityPlan('N7002'),
];

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='inspection_plan' AND xtype='U')
      CREATE TABLE inspection_plan (
        plan_name NVARCHAR(100) NOT NULL PRIMARY KEY,
        inspect_type NVARCHAR(20) DEFAULT '',
        is_full_inspect NVARCHAR(10) DEFAULT N'否',
        is_sampling NVARCHAR(10) DEFAULT N'否',
        sampling_trigger NVARCHAR(50) DEFAULT '',
        sampling_type NVARCHAR(50) DEFAULT '',
        sampling_ratio DECIMAL(18,4) DEFAULT 0,
        decimal_handling NVARCHAR(50) DEFAULT '',
        sampling_quantity INT DEFAULT 0,
        sampling_range_type NVARCHAR(50) DEFAULT '',
        sampling_quantity_range INT DEFAULT 0,
        sampling_batch_range INT DEFAULT 0,
        is_first_inspect NVARCHAR(10) DEFAULT N'否',
        first_inspect_time NVARCHAR(100) DEFAULT '',
        first_inspect_quantity INT DEFAULT 0,
        is_last_inspect NVARCHAR(10) DEFAULT N'否',
        last_inspect_quantity INT DEFAULT 0
      )
    `);
    console.log('表创建/检查完成');

    let inserted = 0;
    for (const item of seedData) {
      try {
        await sequelize.query(
          `IF NOT EXISTS (SELECT 1 FROM inspection_plan WHERE plan_name = :plan_name)
           INSERT INTO inspection_plan (plan_name, inspect_type, is_full_inspect, is_sampling, sampling_trigger,
             sampling_type, sampling_ratio, decimal_handling, sampling_quantity, sampling_range_type,
             sampling_quantity_range, sampling_batch_range, is_first_inspect, first_inspect_time,
             first_inspect_quantity, is_last_inspect, last_inspect_quantity)
           VALUES (:plan_name, :inspect_type, :is_full_inspect, :is_sampling, :sampling_trigger,
             :sampling_type, :sampling_ratio, :decimal_handling, :sampling_quantity, :sampling_range_type,
             :sampling_quantity_range, :sampling_batch_range, :is_first_inspect, :first_inspect_time,
             :first_inspect_quantity, :is_last_inspect, :last_inspect_quantity)`,
          { replacements: item }
        );
        inserted++;
      } catch (e: any) {
        console.log(`跳过: ${item.plan_name} - ${e.message}`);
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
