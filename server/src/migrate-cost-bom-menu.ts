import sequelize from './config/database';

async function migrate() {
  try {
    console.log('开始添加成本BOM菜单...');

    // 1. 查找 bom-management 的 id
    const parentRows: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'bom-management'`,
      { type: 'SELECT' }
    );
    if (parentRows.length === 0) {
      console.error('未找到 bom-management 菜单，添加失败');
      process.exit(1);
    }
    const parentId = parentRows[0].id;
    console.log('找到 bom-management, id:', parentId);

    // 2. 添加成本BOM页面权限
    const existing: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'cost-bom'`,
      { type: 'SELECT' }
    );
    if (existing.length === 0) {
      await sequelize.query(
        `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, sort_order, status)
         VALUES (N'成本BOM', 'cost-bom', 'page', :parentId, 'cost-bom', '/cost-bom', 6, N'启用')`,
        { replacements: { parentId } }
      );
      console.log('  Added page: 成本BOM (under bom-management)');
    } else {
      console.log('  Page already exists: 成本BOM');
    }

    // 3. 添加成本BOM的操作权限
    const costBomPerm: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'cost-bom'`,
      { type: 'SELECT' }
    );
    if (costBomPerm.length > 0) {
      const pageId = costBomPerm[0].id;

      const ops = [
        { name: '查看成本BOM', code: 'cost-bom:view', sort: 1 },
        { name: '导出成本BOM', code: 'cost-bom:export', sort: 2 },
      ];
      for (const op of ops) {
        const existOp: any = await sequelize.query(
          `SELECT id FROM permission WHERE permission_code = :code`,
          { replacements: { code: op.code }, type: 'SELECT' }
        );
        if (existOp.length === 0) {
          await sequelize.query(
            `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, sort_order, status)
             VALUES (N'${op.name}', '${op.code}', 'operation', :pageId, ${op.sort}, N'启用')`,
            { replacements: { pageId } }
          );
          console.log(`  Added operation: ${op.name}`);
        } else {
          console.log(`  Operation already exists: ${op.name}`);
        }
      }
    }

    // 4. 给admin角色分配所有成本BOM权限
    const adminRole: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'admin'`, { type: 'SELECT' });
    if (adminRole.length > 0) {
      const costBomPerms: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code LIKE 'cost-bom%'`,
        { type: 'SELECT' }
      );
      for (const perm of costBomPerms) {
        const existingRp: any = await sequelize.query(
          `SELECT id FROM role_permission WHERE role_id = :rid AND permission_id = :pid`,
          { replacements: { rid: adminRole[0].id, pid: perm.id }, type: 'SELECT' }
        );
        if (existingRp.length === 0) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
            { replacements: { rid: adminRole[0].id, pid: perm.id } }
          );
          console.log('  Assigned cost-bom permission to admin role');
        }
      }
    }

    // 5. 给manager角色分配查看权限
    const managerRole: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'manager'`, { type: 'SELECT' });
    if (managerRole.length > 0) {
      const viewPerm: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = 'cost-bom'`,
        { type: 'SELECT' }
      );
      if (viewPerm.length > 0) {
        const existingRp: any = await sequelize.query(
          `SELECT id FROM role_permission WHERE role_id = :rid AND permission_id = :pid`,
          { replacements: { rid: managerRole[0].id, pid: viewPerm[0].id }, type: 'SELECT' }
        );
        if (existingRp.length === 0) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
            { replacements: { rid: managerRole[0].id, pid: viewPerm[0].id } }
          );
          console.log('  Assigned cost-bom page to manager role');
        }
      }
    }

    console.log('成本BOM菜单添加完成!');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
