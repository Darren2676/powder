import { Sequelize } from 'sequelize';

export const up = async (sequelize: Sequelize): Promise<void> => {
  // ========== 1. packing_box_inventory 箱装库存表 ==========
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='packing_box_inventory' AND xtype='U')
    CREATE TABLE packing_box_inventory (
      id INT IDENTITY(1,1) PRIMARY KEY,
      box_number NVARCHAR(50) NOT NULL,
      packing_number NVARCHAR(50) NOT NULL,
      item_number NVARCHAR(50) NOT NULL,
      item_name NVARCHAR(200) DEFAULT '',
      specifications NVARCHAR(200) DEFAULT '',
      basic_unit NVARCHAR(50) DEFAULT '',
      warehouse_number NVARCHAR(50) NOT NULL,
      warehouse_name NVARCHAR(200) DEFAULT '',
      total_quantity DECIMAL(18,4) DEFAULT 0,
      batch_numbers NVARCHAR(500) DEFAULT '',
      status NVARCHAR(20) DEFAULT N'在库',
      location NVARCHAR(100) DEFAULT '',
      inbound_date DATETIME DEFAULT GETDATE(),
      outbound_date DATETIME NULL,
      creation_date DATETIME DEFAULT GETDATE(),
      last_updated DATETIME DEFAULT GETDATE()
    );
  `);

  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_pbi_box')
    CREATE UNIQUE INDEX IX_pbi_box ON packing_box_inventory(box_number);
  `);

  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_pbi_item_wh')
    CREATE INDEX IX_pbi_item_wh ON packing_box_inventory(item_number, warehouse_number);
  `);

  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_pbi_status')
    CREATE INDEX IX_pbi_status ON packing_box_inventory(status);
  `);

  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM sysindexes WHERE name='IX_pbi_packing')
    CREATE INDEX IX_pbi_packing ON packing_box_inventory(packing_number);
  `);

  console.log('✓ packing_box_inventory 表已创建');
};

export const down = async (sequelize: Sequelize): Promise<void> => {
  await sequelize.query('IF EXISTS (SELECT * FROM sysindexes WHERE name=\'IX_pbi_status\') DROP INDEX IX_pbi_status ON packing_box_inventory');
  await sequelize.query('IF EXISTS (SELECT * FROM sysindexes WHERE name=\'IX_pbi_item_wh\') DROP INDEX IX_pbi_item_wh ON packing_box_inventory');
  await sequelize.query('IF EXISTS (SELECT * FROM sysindexes WHERE name=\'IX_pbi_box\') DROP INDEX IX_pbi_box ON packing_box_inventory');
  await sequelize.query('IF EXISTS (SELECT * FROM sysindexes WHERE name=\'IX_pbi_packing\') DROP INDEX IX_pbi_packing ON packing_box_inventory');
  await sequelize.query('IF EXISTS (SELECT * FROM sysobjects WHERE name=\'packing_box_inventory\' AND xtype=\'U\') DROP TABLE packing_box_inventory');
  console.log('✓ packing_box_inventory 表已删除');
};
