import sequelize from '../../config/database';

export async function migrateDesignMfgBom() {
  // 将 design_bom_header 重命名为 mfg_bom_header（如果旧表存在且新表不存在）
  try {
    await sequelize.query(`
      IF EXISTS (SELECT * FROM sysobjects WHERE name='design_bom_header' AND xtype='U')
        AND NOT EXISTS (SELECT * FROM sysobjects WHERE name='mfg_bom_header' AND xtype='U')
      BEGIN
        EXEC sp_rename 'design_bom_header', 'mfg_bom_header';
        EXEC sp_rename 'mfg_bom_header.design_bom_number', 'mfg_bom_number', 'COLUMN';
        EXEC sp_rename 'mfg_bom_header.design_bom_name', 'mfg_bom_name', 'COLUMN';
      END
    `);
  } catch (e) { console.log('design_bom_header 重命名跳过'); }

  // 将 design_bom_detail 重命名为 mfg_bom_detail（如果旧表存在且新表不存在）
  try {
    await sequelize.query(`
      IF EXISTS (SELECT * FROM sysobjects WHERE name='design_bom_detail' AND xtype='U')
        AND NOT EXISTS (SELECT * FROM sysobjects WHERE name='mfg_bom_detail' AND xtype='U')
      BEGIN
        EXEC sp_rename 'design_bom_detail', 'mfg_bom_detail';
        EXEC sp_rename 'mfg_bom_detail.design_bom_number', 'mfg_bom_number', 'COLUMN';
        IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('mfg_bom_detail') AND name = 'child_design_bom_number')
          EXEC sp_rename 'mfg_bom_detail.child_design_bom_number', 'child_mfg_bom_number', 'COLUMN';
      END
    `);
  } catch (e) { console.log('design_bom_detail 重命名跳过'); }

  // 如果新表也不存在（全新环境），则创建
  // 1. mfg_bom_header
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='mfg_bom_header' AND xtype='U')
      BEGIN
        CREATE TABLE mfg_bom_header (
          mfg_bom_number VARCHAR(50) NOT NULL PRIMARY KEY,
          mfg_bom_name NVARCHAR(200) DEFAULT '',
          item_number VARCHAR(50) DEFAULT '',
          item_name NVARCHAR(200) DEFAULT '',
          bom_version VARCHAR(20) DEFAULT 'V1.0',
          base_quantity DECIMAL(18,4) DEFAULT 1,
          base_unit VARCHAR(20) DEFAULT '',
          [condition] VARCHAR(20) DEFAULT N'启用',
          approval_status VARCHAR(20) DEFAULT N'草稿',
          remark NVARCHAR(500) DEFAULT '',
          creation_date VARCHAR(50) DEFAULT '',
          creation_man VARCHAR(50) DEFAULT ''
        );
        CREATE INDEX IX_mfg_bom_header_item ON mfg_bom_header(item_number);
      END
    `);
  } catch (e) { console.log('mfg_bom_header 表创建跳过或已存在'); }

  // 2. mfg_bom_detail
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='mfg_bom_detail' AND xtype='U')
      BEGIN
        CREATE TABLE mfg_bom_detail (
          id INT IDENTITY(1,1) PRIMARY KEY,
          mfg_bom_number VARCHAR(50) NOT NULL,
          line_number INT DEFAULT 10,
          material_number VARCHAR(50) DEFAULT '',
          material_name NVARCHAR(200) DEFAULT '',
          material_type VARCHAR(50) DEFAULT '',
          standard_quantity DECIMAL(18,4) DEFAULT 0,
          unit VARCHAR(20) DEFAULT '',
          wastage_rate DECIMAL(18,4) DEFAULT 0,
          actual_quantity DECIMAL(18,4) DEFAULT 0,
          child_mfg_bom_number VARCHAR(50) NULL,
          is_key_material INT DEFAULT 0,
          supply_type VARCHAR(50) DEFAULT '',
          default_warehouse VARCHAR(50) DEFAULT '',
          remark NVARCHAR(500) DEFAULT ''
        );
        CREATE INDEX IX_mfg_bom_detail_bom ON mfg_bom_detail(mfg_bom_number);
        CREATE INDEX IX_mfg_bom_detail_mat ON mfg_bom_detail(material_number);
      END
    `);
  } catch (e) { console.log('mfg_bom_detail 表创建跳过或已存在'); }

  // 为 mfg_bom_header 添加新列：bom_type, process_route_number
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='mfg_bom_header' AND COLUMN_NAME='bom_type')
        ALTER TABLE mfg_bom_header ADD bom_type VARCHAR(50) DEFAULT '';
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='mfg_bom_header' AND COLUMN_NAME='process_route_number')
        ALTER TABLE mfg_bom_header ADD process_route_number VARCHAR(50) DEFAULT '';
    `);
  } catch (e) { console.log('mfg_bom_header 新增列跳过'); }

  // 为 mfg_bom_detail 添加新列：step_number, substitute_group, substitute_priority
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='mfg_bom_detail' AND COLUMN_NAME='step_number')
        ALTER TABLE mfg_bom_detail ADD step_number VARCHAR(50) DEFAULT '';
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='mfg_bom_detail' AND COLUMN_NAME='substitute_group')
        ALTER TABLE mfg_bom_detail ADD substitute_group VARCHAR(50) DEFAULT '';
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='mfg_bom_detail' AND COLUMN_NAME='substitute_priority')
        ALTER TABLE mfg_bom_detail ADD substitute_priority INT DEFAULT 0;
    `);
  } catch (e) { console.log('mfg_bom_detail 新增列跳过'); }

  // 清理已删除模块的表：semi_product_plan, semi_product_plan_detail
  try {
    await sequelize.query(`
      IF EXISTS (SELECT * FROM sysobjects WHERE name='semi_product_plan_detail' AND xtype='U') DROP TABLE semi_product_plan_detail;
      IF EXISTS (SELECT * FROM sysobjects WHERE name='semi_product_plan' AND xtype='U') DROP TABLE semi_product_plan;
    `);
  } catch (e) { console.log('清理半成品计划表时跳过'); }

  // 清理旧的 design_bom 表（如果重命名后仍存在残留）
  try {
    await sequelize.query(`
      IF EXISTS (SELECT * FROM sysobjects WHERE name='design_bom_detail' AND xtype='U') DROP TABLE design_bom_detail;
      IF EXISTS (SELECT * FROM sysobjects WHERE name='design_bom_header' AND xtype='U') DROP TABLE design_bom_header;
    `);
  } catch (e) { console.log('清理旧 design_bom 表时跳过'); }

  console.log('制造BOM 表迁移完成');
}
