/**
 * 066: inventory_transaction 添加 shipping_order_number 字段
 * - 用于出库撤回时精确关联 shipping_order
 */
import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'inventory_transaction' AND COLUMN_NAME = 'shipping_order_number')
      BEGIN
        ALTER TABLE inventory_transaction ADD shipping_order_number NVARCHAR(50) DEFAULT ''
      END
    `)
    console.log('inventory_transaction.shipping_order_number 字段添加成功')
  } catch (e: any) {
    console.log('shipping_order_number 迁移跳过或已存在:', e?.message || e)
  }

  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_it_shipping_order' AND object_id = OBJECT_ID('inventory_transaction'))
      CREATE INDEX IX_it_shipping_order ON inventory_transaction (shipping_order_number)
    `)
    console.log('IX_it_shipping_order 索引创建成功')
  } catch (e: any) {
    console.log('IX_it_shipping_order 索引迁移跳过:', e?.message || e)
  }
}
