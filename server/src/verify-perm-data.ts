import sequelize from './config/database';

async function verify() {
  try {
    console.log('=== 权限数据验证 ===');
    
    const counts: any = await sequelize.query(
      `SELECT permission_type, COUNT(*) as cnt FROM permission GROUP BY permission_type ORDER BY permission_type`,
      { type: 'SELECT' }
    );
    console.log('权限类型统计:', JSON.stringify(counts, null, 2));
    
    const salesOrderPage: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'sales-orders'`,
      { type: 'SELECT' }
    );
    if (salesOrderPage.length > 0) {
      const children: any = await sequelize.query(
        `SELECT permission_name, permission_code, permission_type FROM permission WHERE parent_id = :pid ORDER BY sort_order`,
        { replacements: { pid: salesOrderPage[0].id }, type: 'SELECT' }
      );
      console.log('\n销售订单子权限:', JSON.stringify(children, null, 2));
    }

    const adminOps: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM role_permission rp INNER JOIN role r ON r.id = rp.role_id INNER JOIN permission p ON p.id = rp.permission_id WHERE r.role_code = 'admin' AND p.permission_type = 'operation'`,
      { type: 'SELECT' }
    );
    console.log('\nadmin角色操作权限数:', adminOps[0].cnt);

    const adminFields: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM role_permission rp INNER JOIN role r ON r.id = rp.role_id INNER JOIN permission p ON p.id = rp.permission_id WHERE r.role_code = 'admin' AND p.permission_type = 'field'`,
      { type: 'SELECT' }
    );
    console.log('admin角色字段权限数:', adminFields[0].cnt);
    
    process.exit(0);
  } catch (err) {
    console.error('验证失败:', err);
    process.exit(1);
  }
}

verify();
