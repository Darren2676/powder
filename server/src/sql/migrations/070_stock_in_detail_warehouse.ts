import sequelize from '../../config/database';

/**
 * 070: stock_in_detail 新增仓库字段
 * 支持确认收货时按行指定入库仓库（不同物料入不同仓库）
 */
export async function runMigration(): Promise<void> {
  // 检查列是否已存在
  const [cols]: any = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'stock_in_detail' AND COLUMN_NAME IN ('warehouse_number', 'warehouse_name')`
  );
  const existing = cols.map((c: any) => c.COLUMN_NAME);

  if (!existing.includes('warehouse_number')) {
    await sequelize.query(`ALTER TABLE stock_in_detail ADD warehouse_number NVARCHAR(50) DEFAULT N''`);
    console.log('  ✓ stock_in_detail.warehouse_number 已添加');
  } else {
    console.log('  → stock_in_detail.warehouse_number 已存在，跳过');
  }

  if (!existing.includes('warehouse_name')) {
    await sequelize.query(`ALTER TABLE stock_in_detail ADD warehouse_name NVARCHAR(200) DEFAULT N''`);
    console.log('  ✓ stock_in_detail.warehouse_name 已添加');
  } else {
    console.log('  → stock_in_detail.warehouse_name 已存在，跳过');
  }

  console.log('070: stock_in_detail 仓库字段迁移完成');
}

runMigration().then(() => process.exit(0)).catch(err => { console.error('070 迁移失败:', err); process.exit(1); });
