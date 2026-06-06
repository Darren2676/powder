// 执行 SQL 迁移脚本 — 样品申请管理建表
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'Seals MES System', 'server', '.env') });

const sequelize = new Sequelize({
  dialect: 'mssql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME || 'SEALSMES',
  username: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'cowork',
  dialectOptions: {
    options: { encrypt: false, trustServerCertificate: true }
  },
  logging: false,
});

(async () => {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    const sqlPath = path.join(__dirname, 'Seals MES System', 'src', 'sql', 'migrations', '001_sample_request.sql');
    let sql = fs.readFileSync(sqlPath, 'utf-8');

    // 按 GO 分割批处理
    const batches = sql.split(/\nGO\b/i).filter(b => b.trim());
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i].trim();
      if (!batch) continue;
      try {
        await sequelize.query(batch);
        console.log(`  ✓ 批次 ${i + 1}/${batches.length} 执行成功`);
      } catch (e) {
        console.error(`  ✗ 批次 ${i + 1} 失败: ${e.message?.split('\n')[0]}`);
      }
    }

    // 验证表已创建
    const tables = ['sample_request', 'sample_request_item', 'sample_request_lab'];
    for (const t of tables) {
      const [r] = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = :tbl`,
        { replacements: { tbl: t } }
      );
      console.log(r[0].cnt > 0 ? `  ✓ 表 ${t} 存在` : `  ✗ 表 ${t} 不存在`);
    }

    console.log('迁移完成!');
  } catch (e) {
    console.error('执行失败:', e.message);
  } finally {
    await sequelize.close();
  }
})();
