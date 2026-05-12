import { Migration } from './migrate';

const migration: Migration = {
  up: async (sequelize) => {
    // ========== 1. product_ext 新增包装规格字段 ==========
    const packFields = [
      { name: 'inner_pack_qty', type: 'DECIMAL(18,4) DEFAULT 0' },
      { name: 'outer_pack_qty', type: 'INT DEFAULT 0' },
      { name: 'inner_pack_unit', type: "NVARCHAR(20) DEFAULT N'袋'" },
      { name: 'outer_pack_unit', type: "NVARCHAR(20) DEFAULT N'箱'" },
    ];
    for (const f of packFields) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'product_ext' AND COLUMN_NAME = '${f.name}')
        ALTER TABLE product_ext ADD ${f.name} ${f.type};
      `);
    }
    console.log('✓ product_ext 包装规格字段已添加');

    // ========== 2. packing_order 装箱单主表 ==========
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='packing_order' AND xtype='U')
      CREATE TABLE packing_order (
        id INT IDENTITY(1,1) PRIMARY KEY,
        packing_number NVARCHAR(50) NOT NULL,
        warehouse_number NVARCHAR(50) DEFAULT '',
        warehouse_name NVARCHAR(200) DEFAULT '',
        item_number NVARCHAR(50) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(20) DEFAULT '',
        total_quantity DECIMAL(18,4) DEFAULT 0,
        total_bags INT DEFAULT 0,
        total_boxes INT DEFAULT 0,
        status NVARCHAR(20) DEFAULT N'草稿',
        operator NVARCHAR(50) DEFAULT '',
        remark NVARCHAR(500) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE(),
        confirmation_date DATETIME NULL
      );
    `);
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_packing_number')
      CREATE UNIQUE INDEX IX_packing_number ON packing_order(packing_number);
    `);
    console.log('✓ packing_order 表已创建');

    // ========== 3. packing_bag 袋明细表 ==========
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='packing_bag' AND xtype='U')
      CREATE TABLE packing_bag (
        id INT IDENTITY(1,1) PRIMARY KEY,
        packing_number NVARCHAR(50) NOT NULL,
        bag_number NVARCHAR(50) NOT NULL,
        bag_sequence INT DEFAULT 0,
        item_number NVARCHAR(50) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(20) DEFAULT '',
        standard_qty DECIMAL(18,4) DEFAULT 0,
        actual_qty DECIMAL(18,4) DEFAULT 0,
        is_full BIT DEFAULT 0,
        box_number NVARCHAR(50) DEFAULT '',
        label_printed BIT DEFAULT 0,
        creation_date DATETIME DEFAULT GETDATE()
      );
    `);
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_bag_number')
      CREATE UNIQUE INDEX IX_bag_number ON packing_bag(bag_number);
    `);
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_pb_packing')
      CREATE INDEX IX_pb_packing ON packing_bag(packing_number);
    `);
    console.log('✓ packing_bag 表已创建');

    // ========== 4. packing_bag_batch 袋批次明细表 ==========
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='packing_bag_batch' AND xtype='U')
      CREATE TABLE packing_bag_batch (
        id INT IDENTITY(1,1) PRIMARY KEY,
        bag_number NVARCHAR(50) NOT NULL,
        batch_number NVARCHAR(50) DEFAULT '',
        item_number NVARCHAR(50) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        source_inbound_order NVARCHAR(50) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE()
      );
    `);
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_pbb_bag')
      CREATE INDEX IX_pbb_bag ON packing_bag_batch(bag_number);
    `);
    console.log('✓ packing_bag_batch 表已创建');

    // ========== 5. packing_box 箱明细表 ==========
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='packing_box' AND xtype='U')
      CREATE TABLE packing_box (
        id INT IDENTITY(1,1) PRIMARY KEY,
        packing_number NVARCHAR(50) NOT NULL,
        box_number NVARCHAR(50) NOT NULL,
        box_sequence INT DEFAULT 0,
        item_number NVARCHAR(50) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        standard_bag_qty INT DEFAULT 0,
        actual_bag_qty INT DEFAULT 0,
        total_quantity DECIMAL(18,4) DEFAULT 0,
        is_full BIT DEFAULT 0,
        label_printed BIT DEFAULT 0,
        warehouse_number NVARCHAR(50) DEFAULT '',
        warehouse_name NVARCHAR(200) DEFAULT '',
        status NVARCHAR(20) DEFAULT N'在库',
        creation_date DATETIME DEFAULT GETDATE()
      );
    `);
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_box_number')
      CREATE UNIQUE INDEX IX_box_number ON packing_box(box_number);
    `);
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_pbox_packing')
      CREATE INDEX IX_pbox_packing ON packing_box(packing_number);
    `);
    console.log('✓ packing_box 表已创建');
  },
  down: async (sequelize) => {
    await sequelize.query("IF EXISTS (SELECT * FROM sysobjects WHERE name='packing_box' AND xtype='U') DROP TABLE packing_box;");
    await sequelize.query("IF EXISTS (SELECT * FROM sysobjects WHERE name='packing_bag_batch' AND xtype='U') DROP TABLE packing_bag_batch;");
    await sequelize.query("IF EXISTS (SELECT * FROM sysobjects WHERE name='packing_bag' AND xtype='U') DROP TABLE packing_bag;");
    await sequelize.query("IF EXISTS (SELECT * FROM sysobjects WHERE name='packing_order' AND xtype='U') DROP TABLE packing_order;");
    console.log('✓ 装箱管理表已删除');
  },
};

export default migration;
