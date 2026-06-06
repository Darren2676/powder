import sequelize from '../../config/database';

/**
 * 104: 采购对账 — 为 stock_in_detail 和 purchase_order_detail 添加 reconciliation_status 字段
 */
export async function runMigration(): Promise<void> {
  // stock_in_detail 添加 reconciliation_status
  const [colCheck1]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = 'stock_in_detail' AND COLUMN_NAME = 'reconciliation_status'`
  );
  if (colCheck1[0].cnt === 0) {
    await sequelize.query(
      `ALTER TABLE stock_in_detail ADD reconciliation_status NVARCHAR(20) NOT NULL DEFAULT N'未对账'`
    );
    console.log('  ✓ stock_in_detail.reconciliation_status 字段已添加');
  } else {
    console.log('  → stock_in_detail.reconciliation_status 字段已存在，跳过');
  }

  // purchase_order_detail 添加 reconciliation_status
  const [colCheck2]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = 'purchase_order_detail' AND COLUMN_NAME = 'reconciliation_status'`
  );
  if (colCheck2[0].cnt === 0) {
    await sequelize.query(
      `ALTER TABLE purchase_order_detail ADD reconciliation_status NVARCHAR(20) NOT NULL DEFAULT N'未对账'`
    );
    console.log('  ✓ purchase_order_detail.reconciliation_status 字段已添加');
  } else {
    console.log('  → purchase_order_detail.reconciliation_status 字段已存在，跳过');
  }

  console.log('\n采购对账字段迁移完成。');
}

// 直接运行
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(err => { console.error('迁移失败:', err); process.exit(1) });
}
