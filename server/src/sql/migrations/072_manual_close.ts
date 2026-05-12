import sequelize from '../../config/database';

/**
 * 072: 批量手工关闭 - 数据库变更
 * 1. 三个订单表各添加4列: close_reason, close_remark, force_closed_by, force_closed_date
 * 2. 新建 manual_close_log 审批日志表
 */
export async function runMigration(): Promise<void> {
  const tables = ['sales_order', 'production_order', 'purchase_order'];

  // ========== 1. 三个订单表添加关闭字段 ==========
  for (const table of tables) {
    const cols: [string, string][] = [
      ['close_reason', 'NVARCHAR(50) DEFAULT \'\''],
      ['close_remark', 'NVARCHAR(500) DEFAULT \'\''],
      ['force_closed_by', 'NVARCHAR(100) DEFAULT \'\''],
      ['force_closed_date', 'DATETIME NULL'],
    ];
    for (const [col, def] of cols) {
      const [chk]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = :table AND COLUMN_NAME = :col`,
        { replacements: { table, col } }
      );
      if (chk[0].cnt === 0) {
        await sequelize.query(`ALTER TABLE ${table} ADD ${col} ${def}`);
        console.log(`  ✓ ${table}.${col} 已添加`);
      } else {
        console.log(`  → ${table}.${col} 已存在，跳过`);
      }
    }
  }

  // ========== 2. 新建 manual_close_log 表 ==========
  const [tableCheck]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'manual_close_log'`
  );
  if (tableCheck[0].cnt === 0) {
    await sequelize.query(`
      CREATE TABLE manual_close_log (
        id INT IDENTITY(1,1) PRIMARY KEY,
        module NVARCHAR(50) NOT NULL,
        record_id NVARCHAR(50) NOT NULL,
        batch_group NVARCHAR(50) DEFAULT '',
        exception_categories NVARCHAR(500) DEFAULT '',
        exception_detail NVARCHAR(MAX) DEFAULT '',
        close_reason NVARCHAR(50) DEFAULT '',
        close_remark NVARCHAR(500) DEFAULT '',
        status NVARCHAR(20) DEFAULT N'待审批',
        submitted_by NVARCHAR(100) DEFAULT '',
        submitted_at DATETIME DEFAULT GETDATE(),
        approved_by NVARCHAR(100) DEFAULT '',
        approved_at DATETIME NULL,
        executed_at DATETIME NULL,
        cascade_result NVARCHAR(MAX) DEFAULT '',
        created_at DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('  ✓ manual_close_log 表已创建');
  } else {
    console.log('  → manual_close_log 表已存在，跳过');
  }

  console.log('072: 批量手工关闭迁移完成');
}

runMigration().then(() => process.exit(0)).catch(err => { console.error('072 迁移失败:', err); process.exit(1); });
