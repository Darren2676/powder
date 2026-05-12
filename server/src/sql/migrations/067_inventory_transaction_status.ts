/**
 * 067: inventory_transaction 添加 status 字段
 * - 用于软删除（标记作废）保留审计轨迹
 * - 默认 '正常'，撤回出库时标记为 '作废'
 */
import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'inventory_transaction' AND COLUMN_NAME = 'status')
      BEGIN
        ALTER TABLE inventory_transaction ADD status NVARCHAR(20) DEFAULT N'正常'
      END
    `)
    console.log('inventory_transaction.status 字段添加成功')
  } catch (e: any) {
    console.log('status 迁移跳过或已存在:', e?.message || e)
  }

  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'inventory_transaction' AND COLUMN_NAME = 'void_operator')
      BEGIN
        ALTER TABLE inventory_transaction ADD void_operator NVARCHAR(100) DEFAULT ''
      END
    `)
  } catch {}

  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'inventory_transaction' AND COLUMN_NAME = 'void_date')
      BEGIN
        ALTER TABLE inventory_transaction ADD void_date DATETIME NULL
      END
    `)
  } catch {}
}
