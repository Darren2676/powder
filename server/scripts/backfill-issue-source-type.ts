/**
 * 历史数据回填：为已有 material_issue 记录设置 source_type = '领料'
 * 
 * 执行方式: npx tsx server/scripts/backfill-issue-source-type.ts
 */

import sequelize from '../src/config/database';

async function main() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 检查 source_type 列是否存在
    const [columns]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'material_issue' AND COLUMN_NAME = 'source_type'`
    );

    if (columns.length === 0) {
      console.log('source_type 字段尚未创建，请先运行迁移 093');
      process.exit(1);
    }

    // 统计需要回填的记录数
    const [nullRows]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM material_issue WHERE source_type IS NULL OR source_type = ''`
    );
    const count = nullRows[0].cnt;
    console.log(`需要回填 source_type 的记录数: ${count}`);

    if (count === 0) {
      console.log('无需回填');
      process.exit(0);
    }

    // 回填
    await sequelize.query(
      `UPDATE material_issue SET source_type = N'领料' WHERE source_type IS NULL OR source_type = ''`
    );
    console.log(`成功回填 ${count} 条记录, source_type = '领料'`);

    process.exit(0);
  } catch (err) {
    console.error('回填失败:', err);
    process.exit(1);
  }
}

main();
