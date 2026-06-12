/**
 * 111: 产品批次号产生规则 — 双模式支持
 *
 * 变更内容：
 * 1. 创建 batch_number_rule_config 表（按产品维度配置批次号产生模式）
 * 2. production_order 表添加 preassigned_batch_number 列（模式B预分配批次号）
 * 3. 插入菜单权限（系统管理 → 产品批次号产生规则）
 */
import sequelize from '@/config/database';

export async function up(): Promise<void> {
  console.log('111: 产品批次号产生规则 — 双模式支持 开始...');

  // ============================================================
  // 第一步：创建 batch_number_rule_config 表
  // ============================================================
  const [tableCheck]: any = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'batch_number_rule_config'`
  );
  if (tableCheck.length === 0) {
    await sequelize.query(`
      CREATE TABLE batch_number_rule_config (
        id INT IDENTITY(1,1) PRIMARY KEY,
        item_number NVARCHAR(100) NOT NULL,
        item_name NVARCHAR(200) DEFAULT '',
        factory_id INT NULL,
        batch_rule_mode NVARCHAR(10) NOT NULL DEFAULT 'A',
        batch_number_template NVARCHAR(200) DEFAULT 'FB-{plan_number}',
        append_split_seq BIT DEFAULT 1,
        is_active NVARCHAR(10) DEFAULT N'是',
        creation_date DATETIME DEFAULT GETDATE(),
        creation_man NVARCHAR(50) DEFAULT '',
        last_updated_at DATETIME DEFAULT GETDATE(),
        last_updater NVARCHAR(50) DEFAULT ''
      )
    `);
    console.log('  ✓ batch_number_rule_config 表已创建');

    // 唯一约束：同一产品同一工厂只能有一条规则
    await sequelize.query(`
      CREATE UNIQUE INDEX UQ_batch_rule_item_factory
      ON batch_number_rule_config (item_number, factory_id)
      WHERE factory_id IS NOT NULL
    `);
    // factory_id=NULL 的全局规则唯一约束
    await sequelize.query(`
      CREATE UNIQUE INDEX UQ_batch_rule_item_global
      ON batch_number_rule_config (item_number)
      WHERE factory_id IS NULL
    `);
    console.log('  ✓ 唯一索引已创建');
  } else {
    console.log('  → batch_number_rule_config 表已存在，跳过');
  }

  // ============================================================
  // 第二步：production_order 表添加 preassigned_batch_number 列
  // ============================================================
  const [colCheck]: any = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_order' AND COLUMN_NAME = 'preassigned_batch_number'`
  );
  if (colCheck.length === 0) {
    await sequelize.query(`ALTER TABLE production_order ADD preassigned_batch_number NVARCHAR(50) DEFAULT ''`);
    console.log('  ✓ production_order.preassigned_batch_number 列已添加');
  } else {
    console.log('  → preassigned_batch_number 列已存在，跳过');
  }

  // ============================================================
  // 第三步：插入菜单权限（permission 表）
  // ============================================================
  // 查找"系统设置"菜单ID
  const [systemMenus]: any = await sequelize.query(
    `SELECT id FROM permission WHERE permission_code = 'system' AND permission_type = 'menu' ORDER BY id`
  );
  if (systemMenus.length > 0) {
    const parentId = systemMenus[0].id;

    // 检查是否已存在
    const [existingMenu]: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'batch_number_rule'`
    );
    if (existingMenu.length === 0) {
      // 获取同层级最大排序号
      const [maxSort]: any = await sequelize.query(
        `SELECT ISNULL(MAX(sort_order), 0) as max_sort FROM permission WHERE parent_id = :pid`,
        { replacements: { pid: parentId } }
      );
      const nextSort = (maxSort[0]?.max_sort || 0) + 1;

      await sequelize.query(`
        INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, icon, sort_order, status)
        VALUES (N'产品批次号产生规则', 'batch_number_rule', 'page', :pid, 'batch-number-rules', '/batch-number-rules', NULL, :sort, N'启用')
      `, { replacements: { pid: parentId, sort: nextSort } });
      console.log('  ✓ 权限"产品批次号产生规则"已插入');

      // 为管理员角色授权
      const [adminRoles]: any = await sequelize.query(
        `SELECT id FROM role WHERE role_code = 'admin' OR role_name LIKE N'%管理员%'`
      );
      const [permRow]: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = 'batch_number_rule'`
      );
      if (adminRoles.length > 0 && permRow.length > 0) {
        for (const role of adminRoles) {
          const [existingPerm]: any = await sequelize.query(
            `SELECT id FROM role_permission WHERE role_id = :rid AND permission_id = :pid`,
            { replacements: { rid: role.id, pid: permRow[0].id } }
          );
          if (existingPerm.length === 0) {
            await sequelize.query(
              `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
              { replacements: { rid: role.id, pid: permRow[0].id } }
            );
          }
        }
        console.log('  ✓ 管理员角色已授权');
      }
    } else {
      console.log('  → 权限已存在，跳过');
    }
  } else {
    console.log('  ⚠ 未找到系统设置菜单，跳过权限插入');
  }

  console.log('111: 产品批次号产生规则 — 双模式支持 完成');
}

export async function down(): Promise<void> {
  await sequelize.query(`DROP TABLE IF EXISTS batch_number_rule_config`);
  await sequelize.query(`ALTER TABLE production_order DROP COLUMN IF EXISTS preassigned_batch_number`);
  await sequelize.query(`DELETE FROM permission WHERE permission_code = 'batch_number_rule'`);
  console.log('111: 回滚完成');
}
