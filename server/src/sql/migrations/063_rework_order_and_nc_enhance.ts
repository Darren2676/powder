import { UmzugMigration } from '../../migrate';

const up: UmzugMigration['up'] = async ({ context: sequelize }) => {
  // 1. 创建 rework_order 返修单表
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='rework_order' AND xtype='U')
    CREATE TABLE rework_order (
      id INT IDENTITY(1,1) PRIMARY KEY,
      rework_order_number NVARCHAR(50) NOT NULL,
      nonconforming_number NVARCHAR(50) DEFAULT '',
      source_inspection_number NVARCHAR(50) DEFAULT '',
      production_order_number NVARCHAR(50) DEFAULT '',
      item_number NVARCHAR(100) DEFAULT '',
      item_name NVARCHAR(200) DEFAULT '',
      specifications NVARCHAR(200) DEFAULT '',
      basic_unit NVARCHAR(20) DEFAULT '',
      rework_step_number INT DEFAULT 0,
      rework_quantity DECIMAL(18,4) DEFAULT 0,
      rework_status NVARCHAR(20) DEFAULT N'待返修',
      rework_result NVARCHAR(20) DEFAULT '',
      rework_start_date NVARCHAR(20) DEFAULT '',
      rework_complete_date NVARCHAR(20) DEFAULT '',
      rework_remark NVARCHAR(500) DEFAULT '',
      re_inspection_number NVARCHAR(50) DEFAULT '',
      operator NVARCHAR(50) DEFAULT '',
      remark NVARCHAR(500) DEFAULT '',
      creation_date DATETIME DEFAULT GETDATE(),
      creation_man NVARCHAR(50) DEFAULT ''
    )
  `);

  // 唯一索引
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_rework_order_number' AND object_id=OBJECT_ID('rework_order'))
      CREATE UNIQUE INDEX idx_rework_order_number ON rework_order(rework_order_number)
    `);
  } catch (_e) { /* ignore */ }

  // 2. nonconforming_product 增加关联字段
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='nonconforming_product' AND COLUMN_NAME='rework_order_number')
    ALTER TABLE nonconforming_product ADD rework_order_number NVARCHAR(50) DEFAULT ''
  `);
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='nonconforming_product' AND COLUMN_NAME='stock_in_number')
    ALTER TABLE nonconforming_product ADD stock_in_number NVARCHAR(50) DEFAULT ''
  `);

  // 3. production_inspection 增加返修单号字段
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='production_inspection' AND COLUMN_NAME='rework_order_number')
    ALTER TABLE production_inspection ADD rework_order_number NVARCHAR(50) DEFAULT ''
  `);

  // 4. 添加返修单菜单权限
  try {
    const [qualityParent]: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'quality-data-management' AND permission_type = 'menu'`
    );
    const parentId = qualityParent.length > 0 ? qualityParent[0].id : null;

    const [existing]: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'rework-orders'`
    );
    if (existing.length === 0) {
      await sequelize.query(
        `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, sort_order)
         VALUES (N'返修单管理', 'rework-orders', 'page', :parentId, 'rework-orders', '/rework-orders', 6)`,
        { replacements: { parentId } }
      );
      // 授权限给admin角色
      const [newPerm]: any = await sequelize.query(`SELECT id FROM permission WHERE permission_code = 'rework-orders'`);
      const [adminRole]: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'admin'`);
      if (newPerm.length > 0 && adminRole.length > 0) {
        await sequelize.query(
          `IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id = :roleId AND permission_id = :permId)
           INSERT INTO role_permission (role_id, permission_id) VALUES (:roleId, :permId)`,
          { replacements: { roleId: adminRole[0].id, permId: newPerm[0].id } }
        );
      }
    }
  } catch (e: any) { console.log('返修单菜单权限迁移跳过:', e.message || e) }

  console.log('rework_order table + NC/inspection enhancement columns created');
};

const down: UmzugMigration['down'] = async ({ context: sequelize }) => {
  await sequelize.query(`DROP TABLE IF EXISTS rework_order`);
  await sequelize.query(`
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='nonconforming_product' AND COLUMN_NAME='rework_order_number')
    ALTER TABLE nonconforming_product DROP COLUMN rework_order_number
  `);
  await sequelize.query(`
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='nonconforming_product' AND COLUMN_NAME='stock_in_number')
    ALTER TABLE nonconforming_product DROP COLUMN stock_in_number
  `);
  await sequelize.query(`
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='production_inspection' AND COLUMN_NAME='rework_order_number')
    ALTER TABLE production_inspection DROP COLUMN rework_order_number
  `);
  console.log('rework_order table + columns dropped');
};

export { up, down };
