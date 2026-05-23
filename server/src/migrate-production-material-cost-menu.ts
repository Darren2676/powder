import sequelize from './config/database';

async function migrate() {
  try {
    console.log('开始添加生产单材料成本菜单...');

    // 1. 查找 production 的 id（生产管理一级菜单）
    const parentRows: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'production'`,
      { type: 'SELECT' }
    );
    if (parentRows.length === 0) {
      console.error('未找到 production 菜单，添加失败');
      process.exit(1);
    }
    const parentId = parentRows[0].id;
    console.log('找到 production, id:', parentId);

    // 2. 添加生产单材料成本页面权限
    const existing: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'production-material-cost'`,
      { type: 'SELECT' }
    );
    if (existing.length === 0) {
      await sequelize.query(
        `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, sort_order, status)
         VALUES (N'生产单材料成本', 'production-material-cost', 'page', :parentId, 'production-material-cost', '/production-material-cost', 10, N'启用')`,
        { replacements: { parentId } }
      );
      console.log('  Added page: 生产单材料成本 (under production)');
    } else {
      console.log('  Page already exists: 生产单材料成本');
    }

    // 3. 添加操作权限
    const pagePerm: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'production-material-cost'`,
      { type: 'SELECT' }
    );
    if (pagePerm.length > 0) {
      const pageId = pagePerm[0].id;

      const ops = [
        { name: '查看生产单材料成本', code: 'production-material-cost:view', sort: 1 },
        { name: '导出生产单材料成本', code: 'production-material-cost:export', sort: 2 },
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

    // 4. 给admin角色分配所有权限
    const adminRole: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'admin'`, { type: 'SELECT' });
    if (adminRole.length > 0) {
      const perms: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code LIKE 'production-material-cost%'`,
        { type: 'SELECT' }
      );
      for (const perm of perms) {
        const existingRp: any = await sequelize.query(
          `SELECT id FROM role_permission WHERE role_id = :rid AND permission_id = :pid`,
          { replacements: { rid: adminRole[0].id, pid: perm.id }, type: 'SELECT' }
        );
        if (existingRp.length === 0) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
            { replacements: { rid: adminRole[0].id, pid: perm.id } }
          );
          console.log('  Assigned production-material-cost permission to admin role');
        }
      }
    }

    // 5. 给manager角色分配页面权限
    const managerRole: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'manager'`, { type: 'SELECT' });
    if (managerRole.length > 0) {
      const viewPerm: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = 'production-material-cost'`,
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
          console.log('  Assigned production-material-cost page to manager role');
        }
      }
    }

    console.log('生产单材料成本菜单添加完成!');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
