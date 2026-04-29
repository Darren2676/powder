import sequelize from './config/database';

async function check() {
  const rows: any = await sequelize.query(
    `SELECT id, permission_code, permission_name FROM permission WHERE id = 71`,
    { type: 'SELECT' }
  );
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
