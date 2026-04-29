import sequelize from './config/database';

async function fix() {
  // 1. 删除重复的 material-issue-page（与原 material-issue 相同路由）
  const dup: any = await sequelize.query(
    `SELECT id, permission_name, permission_code, menu_key FROM permission WHERE permission_code = 'material-issue-page'`,
    { type: 'SELECT' }
  );
  if (dup.length > 0) {
    await sequelize.query('DELETE FROM role_permission WHERE permission_id = :pid', { replacements: { pid: dup[0].id } });
    await sequelize.query('DELETE FROM permission WHERE id = :pid', { replacements: { pid: dup[0].id } });
    console.log('Deleted duplicate: material-issue-page');
  }

  // 2. 将原 material-issue 名称改为 按生产单备料（与路由对应）
  await sequelize.query(
    `UPDATE permission SET permission_name = N'按生产单备料' WHERE permission_code = 'material-issue'`,
  );
  console.log('Renamed material-issue to 按生产单备料');

  // 3. 修复权限菜单管理的乱码
  await sequelize.query(
    `UPDATE permission SET permission_name = N'权限菜单管理' WHERE permission_code = 'permissions'`,
  );
  console.log('Fixed permissions name encoding');

  // 4. 重新分配admin权限
  const adminRole: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'admin'`, { type: 'SELECT' });
  if (adminRole.length > 0) {
    await sequelize.query('DELETE FROM role_permission WHERE role_id = :rid', { replacements: { rid: adminRole[0].id } });
    await sequelize.query(
      `INSERT INTO role_permission (role_id, permission_id) SELECT :rid, id FROM permission`,
      { replacements: { rid: adminRole[0].id } }
    );
    console.log('admin role reassigned');
  }

  // 5. 重新分配manager权限
  const managerRole: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'manager'`, { type: 'SELECT' });
  if (managerRole.length > 0) {
    await sequelize.query('DELETE FROM role_permission WHERE role_id = :rid', { replacements: { rid: managerRole[0].id } });
    await sequelize.query(
      `INSERT INTO role_permission (role_id, permission_id) SELECT :rid, id FROM permission WHERE permission_code NOT IN ('system','users','departments','workflow','permissions','roles')`,
      { replacements: { rid: managerRole[0].id } }
    );
    console.log('manager role reassigned');
  }

  console.log('Fix done!');
  process.exit(0);
}

fix();
