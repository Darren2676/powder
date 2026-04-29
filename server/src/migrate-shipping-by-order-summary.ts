import sequelize from './config/database';

async function migrate() {
  try {
    console.log('开始添加销售发货按订单汇总表菜单...');

    // 查找 shipping-warning 的父级
    const parentRows: any = await sequelize.query(
      `SELECT parent_id FROM permission WHERE permission_code = 'shipping-warning'`,
      { type: 'SELECT' }
    );
    if (parentRows.length === 0) {
      console.log('shipping-warning 不存在，跳过');
      process.exit(1);
    }
    const parentId = parentRows[0].parent_id;

    // 检查是否已存在
    const existing: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'shipping-by-order-summary'`,
      { type: 'SELECT' }
    );

    if (existing.length === 0) {
      await sequelize.query(
        `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, sort_order, status)
         VALUES (N'销售发货按订单汇总表', 'shipping-by-order-summary', 'page', :parentId, 'shipping-by-order-summary', '/shipping-by-order-summary', 4, N'启用')`,
        { replacements: { parentId } }
      );
      console.log('  Added page: 销售发货按订单汇总表');
    } else {
      await sequelize.query(
        `UPDATE permission SET parent_id = :parentId, route_path = '/shipping-by-order-summary', menu_key = 'shipping-by-order-summary' WHERE permission_code = 'shipping-by-order-summary'`,
        { replacements: { parentId } }
      );
      console.log('  Updated page: 销售发货按订单汇总表');
    }

    // 重新给admin分配所有权限
    const adminRole: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'admin'`, { type: 'SELECT' });
    if (adminRole.length > 0) {
      await sequelize.query(`DELETE FROM role_permission WHERE role_id = :rid`, { replacements: { rid: adminRole[0].id } });
      await sequelize.query(
        `INSERT INTO role_permission (role_id, permission_id) SELECT :rid, id FROM permission`,
        { replacements: { rid: adminRole[0].id } }
      );
      console.log('  admin role reassigned all permissions');
    }

    // 给manager分配除system外权限
    const managerRole: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'manager'`, { type: 'SELECT' });
    if (managerRole.length > 0) {
      await sequelize.query(`DELETE FROM role_permission WHERE role_id = :rid`, { replacements: { rid: managerRole[0].id } });
      await sequelize.query(
        `INSERT INTO role_permission (role_id, permission_id) SELECT :rid, id FROM permission WHERE permission_code NOT IN ('system', 'users', 'departments', 'workflow', 'permissions', 'roles')`,
        { replacements: { rid: managerRole[0].id } }
      );
      console.log('  manager role reassigned permissions');
    }

    console.log('销售发货按订单汇总表菜单添加完成!');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
