const sql = require('mssql');
const dotenv = require('dotenv');
dotenv.config({ path: 'd:/powder/Seals MES System/server/.env' });

const cfg = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};

async function main() {
  await sql.connect(cfg);
  const r = await sql.query('SELECT id, factory_code, factory_name FROM factory');
  console.log(JSON.stringify(r.recordset));
  await sql.close();
}

main().catch(e => { console.error(e); process.exit(1); });
