/**
 * 执行 engineering_change 建表 SQL（一次性脚本）
 * 读取 src/sql/migrations/002_engineering_change.sql 并按 GO 分批执行
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '1433'),
    dialect: 'mssql',
    logging: false,
    dialectOptions: {
      options: { encrypt: false, trustServerCertificate: true }
    }
  }
);

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Connected to DB.');

    const sqlPath = path.resolve(
      __dirname,
      '../../../../src/sql/migrations/002_engineering_change.sql'
    );
    console.log('Reading SQL:', sqlPath);
    const raw = fs.readFileSync(sqlPath, 'utf8');

    // 按行级 GO 分批
    const batches = raw
      .split(/^\s*GO\s*$/im)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`Total batches: ${batches.length}`);
    for (let i = 0; i < batches.length; i++) {
      console.log(`Executing batch ${i + 1}/${batches.length} ...`);
      await sequelize.query(batches[i]);
    }
    console.log('All batches executed successfully.');
  } catch (err) {
    console.error('Error:', err.message);
    if (err.original) console.error('Original:', err.original.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

run();
