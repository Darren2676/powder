const { Sequelize } = require('sequelize');
require('dotenv').config();
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST || 'localhost', port: parseInt(process.env.DB_PORT || '1433'),
  dialect: 'mssql', logging: false,
  dialectOptions: { options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true } }
});
async function fix() {
  await sequelize.authenticate();
  const r1 = await sequelize.query(`SELECT id FROM permission WHERE permission_code = 'standard-costs'`);
  const permId = r1[0][0].id;
  const r2 = await sequelize.query(`SELECT id FROM role_permission WHERE role_id = 1 AND permission_id = :pid`, { replacements: { pid: permId } });
  if (!r2[0].length) {
    await sequelize.query(`INSERT INTO role_permission (role_id, permission_id) VALUES (1, :pid)`, { replacements: { pid: permId } });
    console.log('Admin permission granted for standard-costs');
  } else {
    console.log('Already granted');
  }
  await sequelize.close();
}
fix();