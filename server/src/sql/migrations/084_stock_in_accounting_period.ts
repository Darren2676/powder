import sequelize from '../../config/database';

/**
 * 084: stock_in 表添加 accounting_period 列
 * 报废入库单需要会计期间字段，值取确认日期对应的年月（YYYY-MM）。
 * scrap_disposal 表已有 accounting_period 列（迁移050），此处仅处理 stock_in。
 */
export async function runMigration(): Promise<void> {
  // 添加 accounting_period 列到 stock_in 表
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'stock_in' AND COLUMN_NAME = 'accounting_period')
    BEGIN
      ALTER TABLE stock_in ADD accounting_period NVARCHAR(7) DEFAULT '';
    END
  `);

  console.log('084: stock_in.accounting_period 字段迁移完成');
}

// 直接运行此文件时执行
runMigration().then(() => process.exit(0)).catch(err => { console.error('084 迁移失败:', err); process.exit(1); });