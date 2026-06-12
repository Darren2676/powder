import sequelize from '../../config/database';

/**
 * 103: 样品转化率 - 菜单权限迁移
 * 在"样品申请"子菜单下添加：样品转化率
 */
export async function runMigration(): Promise<void> {
  console.log('开始执行样品转化率菜单权限迁移...');

  // 查找"样品申请"子菜单的 permission id
  const parentRows: any = await sequelize.query(
    `SELECT id FROM permission WHERE permission_code = 'sample-request-menu'`,
    { type: 'SELECT' }
  );
  if (parentRows.length === 0) {
    console.log('  SKIP: 找不到样品申请子菜单(sample-request-menu)，跳过');
    return;
  }
  const parentId = parentRows[0].id;

  // 添加"样品转化率"页面权限
  const pages = [
    { name: '样品转化率', code: 'sample-conversion-rate', menu_key: 'sample-conversion-rate', route: '/sample-conversion-rate', sort: 4, icon: 'PercentageOutlined' },
  ];

  for (const p of pages) {
    const existing: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = :code`,
      { replacements: { code: p.code }, type: 'SELECT' }
    );
    if (existing.length === 0) {
      await sequelize.query(
        `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, icon, sort_order, status)
         VALUES (:pName, :pCode, 'page', :parentId, :menuKey, :routePath, :pIcon, :pSort, N'启用')`,
        {
          replacements: {
            pName: p.name, pCode: p.code, parentId, menuKey: p.menu_key,
            routePath: p.route, pIcon: p.icon || null, pSort: p.sort,
          }
        }
      );
      console.log(`  ✓ 添加页面权限: ${p.name} (${p.code})`);
    } else {
      console.log(`  → 页面权限已存在: ${p.name} (${p.code})，跳过`);
    }
  }

  // 给admin角色分配新权限
  const adminRole: any = await sequelize.query(
    `SELECT id FROM role WHERE role_code = 'admin'`,
    { type: 'SELECT' }
  );
  if (adminRole.length > 0) {
    for (const p of pages) {
      const permRows: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = :code`,
        { replacements: { code: p.code }, type: 'SELECT' }
      );
      if (permRows.length > 0) {
        const existing: any = await sequelize.query(
          `SELECT 1 FROM role_permission WHERE role_id = :rid AND permission_id = :pid`,
          { replacements: { rid: adminRole[0].id, pid: permRows[0].id }, type: 'SELECT' }
        );
        if (existing.length === 0) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
            { replacements: { rid: adminRole[0].id, pid: permRows[0].id } }
          );
          console.log(`  ✓ admin已分配权限: ${p.code}`);
        }
      }
    }
  }

  // 给manager角色分配新权限
  const managerRole: any = await sequelize.query(
    `SELECT id FROM role WHERE role_code = 'manager'`,
    { type: 'SELECT' }
  );
  if (managerRole.length > 0) {
    for (const p of pages) {
      const permRows: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = :code`,
        { replacements: { code: p.code }, type: 'SELECT' }
      );
      if (permRows.length > 0) {
        const existing: any = await sequelize.query(
          `SELECT 1 FROM role_permission WHERE role_id = :rid AND permission_id = :pid`,
          { replacements: { rid: managerRole[0].id, pid: permRows[0].id }, type: 'SELECT' }
        );
        if (existing.length === 0) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
            { replacements: { rid: managerRole[0].id, pid: permRows[0].id } }
          );
          console.log(`  ✓ manager已分配权限: ${p.code}`);
        }
      }
    }
  }

  console.log('样品转化率菜单权限迁移完成。');
}

// 直接运行
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(err => { console.error('迁移失败:', err); process.exit(1); });
}
