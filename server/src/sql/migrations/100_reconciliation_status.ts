import sequelize from '../../config/database';

export async function up() {
  // 为发货单明细表添加对账状态字段
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'shipping_order_detail' AND COLUMN_NAME = 'reconciliation_status')
    BEGIN
      ALTER TABLE shipping_order_detail ADD reconciliation_status NVARCHAR(10) NOT NULL DEFAULT N'未对账';
    END
  `);
  console.log('[迁移] 100 发货单明细表添加对账状态字段完成');
}

export async function down() {
  await sequelize.query(`
    IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'shipping_order_detail' AND COLUMN_NAME = 'reconciliation_status')
    BEGIN
      ALTER TABLE shipping_order_detail DROP COLUMN reconciliation_status;
    END
  `);
}

export async function runMigration() { await up(); }
runMigration().then(() => process.exit(0)).catch(err => { console.error('100 迁移失败:', err); process.exit(1); });
