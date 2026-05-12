/**
 * 装箱管理 - 袋标签无袋号方案
 * - 新增 packing_bag_label 表（批次标签，替代 packing_bag + packing_bag_batch）
 * - packing_box 增加 batch_numbers 列（记录箱内批次）
 * - packing_order 增加 total_labels 列
 */

import sequelize from '../../config/database'

export const up = async () => {
  // ========== 1. 新增 packing_bag_label 表（批次标签） ==========
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='packing_bag_label' AND xtype='U')
    CREATE TABLE packing_bag_label (
      id INT IDENTITY(1,1) PRIMARY KEY,
      packing_number NVARCHAR(50) NOT NULL,
      batch_number NVARCHAR(50) NOT NULL,
      item_number NVARCHAR(100) DEFAULT '',
      item_name NVARCHAR(200) DEFAULT '',
      specifications NVARCHAR(200) DEFAULT '',
      basic_unit NVARCHAR(20) DEFAULT '',
      label_quantity DECIMAL(18,4) DEFAULT 0,
      standard_qty DECIMAL(18,4) DEFAULT 0,
      is_full BIT DEFAULT 0,
      label_sequence INT DEFAULT 0,
      box_number NVARCHAR(50) DEFAULT '',
      label_printed BIT DEFAULT 0,
      creation_date DATETIME DEFAULT GETDATE()
    );
  `);
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_pbl_packing')
    CREATE INDEX IX_pbl_packing ON packing_bag_label(packing_number);
  `);
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_pbl_batch')
    CREATE INDEX IX_pbl_batch ON packing_bag_label(batch_number);
  `);
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_pbl_box')
    CREATE INDEX IX_pbl_box ON packing_bag_label(box_number);
  `);
  console.log('✓ packing_bag_label 表已创建');

  // ========== 2. packing_box 增加 batch_numbers 列 ==========
  await sequelize.query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'packing_box' AND COLUMN_NAME = 'batch_numbers'
    )
    ALTER TABLE packing_box ADD batch_numbers NVARCHAR(500) DEFAULT '';
  `);
  console.log('✓ packing_box.batch_numbers 列已添加');

  // ========== 3. packing_order 增加 total_labels 列 ==========
  await sequelize.query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'packing_order' AND COLUMN_NAME = 'total_labels'
    )
    ALTER TABLE packing_order ADD total_labels INT DEFAULT 0;
  `);
  console.log('✓ packing_order.total_labels 列已添加');
};

export const down = async () => {
  await sequelize.query(`IF EXISTS (SELECT * FROM sysobjects WHERE name='packing_bag_label' AND xtype='U') DROP TABLE packing_bag_label;`);
  await sequelize.query(`
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'packing_box' AND COLUMN_NAME = 'batch_numbers')
    ALTER TABLE packing_box DROP COLUMN batch_numbers;
  `);
  await sequelize.query(`
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'packing_order' AND COLUMN_NAME = 'total_labels')
    ALTER TABLE packing_order DROP COLUMN total_labels;
  `);
  console.log('✓ 装箱袋标签无袋号方案迁移已回滚');
};
