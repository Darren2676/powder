const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');
const { Sequelize } = require('sequelize');

const seq = new Sequelize({
  dialect: 'mssql',
  host: '127.0.0.1',
  port: 1433,
  database: 'SEALSMES',
  username: 'sa',
  password: 'cowork',
  logging: false,
  dialectOptions: { options: { encrypt: false, trustServerCertificate: true, tdsVersion: '7_2' } }
});

async function main() {
  try {
    await seq.authenticate();
    console.log('Connected');
    // 将调度单打印 (id=111) 从 在制管理(parent_id=74) 移到 生产计划(parent_id=2)
    await seq.query(`UPDATE permission SET parent_id = 2, sort_order = 5 WHERE id = 111`);
    console.log('Updated dispatch-print parent_id to 2 (planning)');
    // 验证
    const rows = await seq.query(
      `SELECT id, permission_name, permission_code, parent_id, sort_order FROM permission WHERE id = 111`,
      { type: 'SELECT' }
    );
    console.log('Verified:', JSON.stringify(rows[0]));
  } catch(e) {
    console.error('Error: ' + e.message);
  } finally {
    await seq.close();
  }
}
main();
