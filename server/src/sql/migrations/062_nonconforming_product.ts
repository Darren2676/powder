import { UmzugMigration } from '../../migrate';

const up: UmzugMigration['up'] = async ({ context: sequelize }) => {
  // 1. 创建 nonconforming_product 不合格品处理单表
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='nonconforming_product' AND xtype='U')
    CREATE TABLE nonconforming_product (
      id INT IDENTITY(1,1) PRIMARY KEY,
      nonconforming_number NVARCHAR(50) NOT NULL,
      source_type NVARCHAR(20) DEFAULT '',
      source_number NVARCHAR(50) DEFAULT '',
      item_number NVARCHAR(100) DEFAULT '',
      item_name NVARCHAR(200) DEFAULT '',
      specifications NVARCHAR(200) DEFAULT '',
      basic_unit NVARCHAR(20) DEFAULT '',
      unqualified_quantity DECIMAL(18,4) DEFAULT 0,
      defect_class_name NVARCHAR(100) DEFAULT '',
      defect_name NVARCHAR(100) DEFAULT '',
      defect_reason_name NVARCHAR(100) DEFAULT '',
      handling_method NVARCHAR(20) DEFAULT '',
      handling_quantity DECIMAL(18,4) DEFAULT 0,
      handling_status NVARCHAR(20) DEFAULT N'待处理',
      handling_remark NVARCHAR(500) DEFAULT '',
      rework_step_number INT NULL,
      concession_quantity DECIMAL(18,4) DEFAULT 0,
      scrap_type NVARCHAR(20) DEFAULT '',
      scrap_quantity DECIMAL(18,4) DEFAULT 0,
      return_order_number NVARCHAR(50) DEFAULT '',
      special_warehouse NVARCHAR(100) DEFAULT '',
      qualified_quantity_after DECIMAL(18,4) DEFAULT 0,
      unqualified_quantity_after DECIMAL(18,4) DEFAULT 0,
      production_order_number NVARCHAR(50) DEFAULT '',
      step_number INT DEFAULT 0,
      supplier_number NVARCHAR(50) DEFAULT '',
      supplier_name NVARCHAR(200) DEFAULT '',
      warehouse_number NVARCHAR(50) DEFAULT '',
      warehouse_name NVARCHAR(200) DEFAULT '',
      operator NVARCHAR(50) DEFAULT '',
      handling_date NVARCHAR(20) DEFAULT '',
      remark NVARCHAR(500) DEFAULT '',
      creation_date DATETIME DEFAULT GETDATE(),
      creation_man NVARCHAR(50) DEFAULT ''
    )
  `);

  // 唯一索引
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_nonconforming_number' AND object_id=OBJECT_ID('nonconforming_product'))
      CREATE UNIQUE INDEX idx_nonconforming_number ON nonconforming_product(nonconforming_number)
    `);
  } catch (_e) { /* ignore */ }

  // 2. production_inspection 增加 nonconforming_number 字段
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='production_inspection' AND COLUMN_NAME='nonconforming_number')
    ALTER TABLE production_inspection ADD nonconforming_number NVARCHAR(50) DEFAULT ''
  `);

  // 3. purchase_quality_inspection 增加 nonconforming_number 字段
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='purchase_quality_inspection' AND COLUMN_NAME='nonconforming_number')
    ALTER TABLE purchase_quality_inspection ADD nonconforming_number NVARCHAR(50) DEFAULT ''
  `);

  // 4. 添加不合格品处理菜单权限
  try {
    const [qualityParent]: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'quality' AND permission_type = 'module'`
    );
    const parentId = qualityParent.length > 0 ? qualityParent[0].id : null;

    const [existing]: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'nonconforming-products'`
    );
    if (existing.length === 0) {
      await sequelize.query(
        `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, sort_order)
         VALUES (N'不合格品处理', 'nonconforming-products', 'page', :parentId, 'nonconforming-products', '/nonconforming-products', 5)`,
        { replacements: { parentId } }
      );
      // 授权限给admin角色
      const [newPerm]: any = await sequelize.query(`SELECT id FROM permission WHERE permission_code = 'nonconforming-products'`);
      const [adminRole]: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'admin'`);
      if (newPerm.length > 0 && adminRole.length > 0) {
        await sequelize.query(
          `IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id = :roleId AND permission_id = :permId)
           INSERT INTO role_permission (role_id, permission_id) VALUES (:roleId, :permId)`,
          { replacements: { roleId: adminRole[0].id, permId: newPerm[0].id } }
        );
      }
    }
  } catch (e: any) { console.log('不合格品处理菜单权限迁移跳过:', e.message || e) }

  console.log('nonconforming_product table + inspection nonconforming_number columns created');
};

const down: UmzugMigration['down'] = async ({ context: sequelize }) => {
  await sequelize.query(`DROP TABLE IF EXISTS nonconforming_product`);
  await sequelize.query(`
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='production_inspection' AND COLUMN_NAME='nonconforming_number')
    ALTER TABLE production_inspection DROP COLUMN nonconforming_number
  `);
  await sequelize.query(`
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='purchase_quality_inspection' AND COLUMN_NAME='nonconforming_number')
    ALTER TABLE purchase_quality_inspection DROP COLUMN nonconforming_number
  `);
  console.log('nonconforming_product table + columns dropped');
};

export { up, down };
