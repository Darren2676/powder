import { UmzugMigration } from '../../migrate';

const up: UmzugMigration['up'] = async ({ context: sequelize }) => {
  // 给 work_center 表添加 warehouse_number 和 warehouse_name 列
  // 这样委外流程中可以通过 work_center 关联到线边仓
  const queries = [
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('work_center') AND name = 'warehouse_number')
     ALTER TABLE work_center ADD warehouse_number NVARCHAR(50) DEFAULT ''`,
    `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('work_center') AND name = 'warehouse_name')
     ALTER TABLE work_center ADD warehouse_name NVARCHAR(100) DEFAULT ''`,
  ];
  for (const q of queries) {
    await sequelize.query(q);
  }
  console.log('work_center warehouse columns added');
};

const down: UmzugMigration['down'] = async ({ context: sequelize }) => {
  const queries = [
    `IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('work_center') AND name = 'warehouse_name')
     ALTER TABLE work_center DROP COLUMN warehouse_name`,
    `IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('work_center') AND name = 'warehouse_number')
     ALTER TABLE work_center DROP COLUMN warehouse_number`,
  ];
  for (const q of queries) {
    await sequelize.query(q);
  }
  console.log('work_center warehouse columns dropped');
};

export { up, down };
