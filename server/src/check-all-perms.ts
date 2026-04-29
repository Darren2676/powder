import sequelize from './config/database';

async function check() {
  const rows: any = await sequelize.query(
    `SELECT id, permission_code, permission_name, permission_type, parent_id, menu_key, route_path FROM permission WHERE permission_type IN ('menu', 'page') ORDER BY parent_id, sort_order`,
    { type: 'SELECT' }
  );
  for (const r of rows) {
    const indent = r.parent_id ? '  ' : '';
    console.log(`${indent}[${r.permission_type}] ${r.permission_code} | ${r.permission_name} | key=${r.menu_key} | route=${r.route_path}`);
  }
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
