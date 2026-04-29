import sequelize from './config/database';

async function migrate() {
  try {
    console.log('开始添加模具BOM映射菜单...');

    // 查找 bom-management 的 id
    const parentRows: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'bom-management'`,
      { type: 'SELECT' }
    );
    if (parentRows.length === 0) {
      console.log('未找到 bom-management 菜单，尝试查找 master-data 直接挂载...');
      const masterDataRows: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = 'master-data'`,
        { type: 'SELECT' }
      );
      if (masterDataRows.length === 0) {
        console.error('未找到 master-data 菜单，添加失败');
        process.exit(1);
      }
      // 直接在 master-data 下添加
      const parentId = masterDataRows[0].id;
      const existing: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = 'mould-bom-mapping'`,
        { type: 'SELECT' }
      );
      if (existing.length === 0) {
        await sequelize.query(
          `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, sort_order, status)
           VALUES (N'模具BOM映射', 'mould-bom-mapping', 'page', :parentId, 'mould-bom-mapping', '/mould-bom-mapping', 99, N'启用')`,
          { replacements: { parentId } }
        );
        console.log('  Added page: 模具BOM映射 (under master-data)');
      } else {
        console.log('  Page already exists: 模具BOM映射');
      }
    } else {
      const parentId = parentRows[0].id;
      const existing: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = 'mould-bom-mapping'`,
        { type: 'SELECT' }
      );
      if (existing.length === 0) {
        await sequelize.query(
          `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, sort_order, status)
           VALUES (N'模具BOM映射', 'mould-bom-mapping', 'page', :parentId, 'mould-bom-mapping', '/mould-bom-mapping', 5, N'启用')`,
          { replacements: { parentId } }
        );
        console.log('  Added page: 模具BOM映射 (under bom-management)');
      } else {
        console.log('  Page already exists: 模具BOM映射');
      }
    }

    // 给admin角色分配该权限
    const adminRole: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'admin'`, { type: 'SELECT' });
    if (adminRole.length > 0) {
      const mouldPerm: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = 'mould-bom-mapping'`,
        { type: 'SELECT' }
      );
      if (mouldPerm.length > 0) {
        const existingRp: any = await sequelize.query(
          `SELECT id FROM role_permission WHERE role_id = :rid AND permission_id = :pid`,
          { replacements: { rid: adminRole[0].id, pid: mouldPerm[0].id }, type: 'SELECT' }
        );
        if (existingRp.length === 0) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
            { replacements: { rid: adminRole[0].id, pid: mouldPerm[0].id } }
          );
          console.log('  Assigned mould-bom-mapping to admin role');
        }
      }
    }

    // 给manager角色分配该权限（非系统权限）
    const managerRole: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'manager'`, { type: 'SELECT' });
    if (managerRole.length > 0) {
      const mouldPerm: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = 'mould-bom-mapping'`,
        { type: 'SELECT' }
      );
      if (mouldPerm.length > 0) {
        const existingRp: any = await sequelize.query(
          `SELECT id FROM role_permission WHERE role_id = :rid AND permission_id = :pid`,
          { replacements: { rid: managerRole[0].id, pid: mouldPerm[0].id }, type: 'SELECT' }
        );
        if (existingRp.length === 0) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
            { replacements: { rid: managerRole[0].id, pid: mouldPerm[0].id } }
          );
          console.log('  Assigned mould-bom-mapping to manager role');
        }
      }
    }

    console.log('模具BOM映射菜单添加完成!');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
