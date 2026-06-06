import sequelize from '../../config/database';

/**
 * 108: 有效期管理报告 - 菜单权限迁移
 * 在"仓库管理"子菜单下添加：有效期管理报告
 */
export async function runMigration(): Promise<void> {
  console.log('开始执行有效期管理报告菜单权限迁移...');

  // 查找"仓库管理"子菜单的 permission id
  const parentRows: any = await sequelize.query(
    `SELECT id FROM permission WHERE permission_code = 'warehouse'`,
    { type: 'SELECT' }
  );
  if (parentRows.length === 0) {
    console.log('  SKIP: 找不到仓库管理子菜单(warehouse)');
    return;
  }
  const parentId = parentRows[0].id;

  // 添加"有效期管理报告"页面权限
  const page = { name: '有效期管理报告', code: 'shelf-life-report', menu_key: 'shelf-life-report', route: '/shelf-life-report', sort: 95, icon: 'FieldTimeOutlined' };

  const existing: any = await sequelize.query(
    `SELECT id FROM permission WHERE permission_code = :code`,
    { replacements: { code: page.code }, type: 'SELECT' }
  );
  if (existing.length === 0) {
    await sequelize.query(
      `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, icon, sort_order, status)
       VALUES (:pName, :pCode, 'page', :parentId, :menuKey, :routePath, :pIcon, :pSort, N'启用')`,
      {
        replacements: {
          pName: page.name, pCode: page.code, parentId, menuKey: page.menu_key,
          routePath: page.route, pIcon: page.icon || null, pSort: page.sort,
        }
      }
    );
    console.log(`  ✓ 添加页面权限: ${page.name} (${page.code})`);
  } else {
    console.log(`  → 页面权限已存在: ${page.name} (${page.code})，跳过`);
  }

  // 给admin角色分配新权限
  const adminRole: any = await sequelize.query(
    `SELECT id FROM role WHERE role_code = 'admin'`,
    { type: 'SELECT' }
  );
  if (adminRole.length > 0) {
    const permRows: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = :code`,
      { replacements: { code: page.code }, type: 'SELECT' }
    );
    if (permRows.length > 0) {
      const rolePermExist: any = await sequelize.query(
        `SELECT id FROM role_permission WHERE role_id = :roleId AND permission_id = :permId`,
        { replacements: { roleId: adminRole[0].id, permId: permRows[0].id }, type: 'SELECT' }
      );
      if (rolePermExist.length === 0) {
        await sequelize.query(
          `INSERT INTO role_permission (role_id, permission_id) VALUES (:roleId, :permId)`,
          { replacements: { roleId: adminRole[0].id, permId: permRows[0].id } }
        );
        console.log('  ✓ 已给admin角色分配有效期管理报告权限');
      } else {
        console.log('  → admin角色已有有效期管理报告权限，跳过');
      }
    }
  }

  console.log('\n有效期管理报告菜单权限迁移完成。');
}

// 直接运行
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(err => { console.error('迁移失败:', err); process.exit(1) });
}
