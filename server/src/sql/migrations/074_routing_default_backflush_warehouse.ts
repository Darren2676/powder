import { Migration } from './migrate';

const migration: Migration = {
  up: async (sequelize) => {
    // routing_header 增加默认倒冲仓库字段
    await sequelize.query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'routing_header' AND COLUMN_NAME = 'default_backflush_warehouse'
      )
      ALTER TABLE routing_header ADD default_backflush_warehouse VARCHAR(50) NULL;
    `);
    console.log('✓ routing_header.default_backflush_warehouse 列已添加');
  },
  down: async (sequelize) => {
    await sequelize.query(`
      IF EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'routing_header' AND COLUMN_NAME = 'default_backflush_warehouse'
      )
      ALTER TABLE routing_header DROP COLUMN default_backflush_warehouse;
    `);
    console.log('✓ routing_header.default_backflush_warehouse 列已删除');
  },
};

export default migration;
