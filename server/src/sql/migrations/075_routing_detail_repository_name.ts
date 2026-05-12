import { Migration } from './migrate';

const migration: Migration = {
  up: async (sequelize) => {
    // routing_detail 增加默认仓库名称字段
    await sequelize.query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'routing_detail' AND COLUMN_NAME = 'default_repository_name'
      )
      ALTER TABLE routing_detail ADD default_repository_name NVARCHAR(200) NULL;
    `);
    console.log('✓ routing_detail.default_repository_name 列已添加');

    // 回填历史数据：根据 default_repository 关联 warehouse 表补全名称
    await sequelize.query(`
      UPDATE rd
      SET rd.default_repository_name = w.warehouse_name
      FROM routing_detail rd
      INNER JOIN warehouse w ON rd.default_repository = w.warehouse_number
      WHERE rd.default_repository IS NOT NULL
        AND rd.default_repository != ''
        AND (rd.default_repository_name IS NULL OR rd.default_repository_name = '');
    `);
    console.log('✓ routing_detail.default_repository_name 历史数据已回填');
  },
  down: async (sequelize) => {
    await sequelize.query(`
      IF EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'routing_detail' AND COLUMN_NAME = 'default_repository_name'
      )
      ALTER TABLE routing_detail DROP COLUMN default_repository_name;
    `);
    console.log('✓ routing_detail.default_repository_name 列已删除');
  },
};

export default migration;
